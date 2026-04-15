from __future__ import annotations

import base64
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO

import httpx
import pypdfium2 as pdfium
from flask import Flask
from PIL import Image

import storage

# ---------- Vision model constants ----------
MODEL_ID = "lightonai/LightOnOCR-2-1B"
API_KEY = "not-needed"
PDF_SCALE = 2.77  # 200 / 72 DPI
MAX_RESOLUTION = 1540
PARSE_WORKERS = 8


# ---------- PDF rendering ----------
def render_pdf_page(page, max_res: int = MAX_RESOLUTION, scale: float = PDF_SCALE) -> Image.Image:
    w, h = page.get_size()
    pw, ph = w * scale, h * scale
    factor = min(1, max_res / pw, max_res / ph)
    bitmap = page.render(scale=scale * factor, rev_byteorder=True)
    img = bitmap.to_pil().copy()  # .copy() ensures PIL owns its memory before pdfium frees it
    bitmap.close()
    return img


def render_and_save_pdf(uid: str, pdf_bytes: bytes, on_page=None) -> int:
    """Render PDF pages one at a time, saving each to Minio immediately to conserve memory.
    Returns the total number of pages. Calls on_page(page_num, total) after each save."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()
        pdf = pdfium.PdfDocument(tmp.name)
        total = len(pdf)
        for i in range(total):
            page = pdf[i]
            img = render_pdf_page(page)
            page.close()
            buf = BytesIO()
            img.save(buf, format="PNG")
            storage.upload_page_image(uid, i + 1, buf.getvalue())
            del img, buf
            if on_page:
                on_page(i + 1, total)
        pdf.close()
    return total


# ---------- Vision API ----------
def _clean_output(text: str) -> str:
    if not text:
        return ""
    markers = ["system", "user", "assistant"]
    lines = text.split("\n")
    cleaned = [l for l in lines if l.strip().lower() not in markers]
    result = "\n".join(cleaned).strip()
    if "assistant" in text.lower():
        parts = text.split("assistant", 1)
        if len(parts) > 1:
            result = parts[1].strip()
    return result


def parse_page(image: Image.Image, server_url: str, max_tokens: int = 8192) -> str:
    buf = BytesIO()
    image.save(buf, format="JPEG", quality=90)
    image_b64 = base64.b64encode(buf.getvalue()).decode()
    image_uri = f"data:image/jpeg;base64,{image_b64}"

    payload = {
        "model": MODEL_ID,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_uri}},
                ],
            }
        ],
        "max_tokens": max_tokens,
        "temperature": 0.0,
        "top_p": 0.9,
        "stream": False,
    }

    headers = {"Authorization": f"Bearer {API_KEY}"}
    resp = httpx.post(
        f"{server_url}/chat/completions",
        json=payload,
        headers=headers,
        timeout=300.0,
    )
    resp.raise_for_status()
    text = resp.json()["choices"][0]["message"]["content"]
    return _clean_output(text)


def run_parse_job(uid: str, server_url: str, app: Flask):
    """Background job: render PDF pages (or load images), then parse them concurrently."""
    def _run():
        with app.app_context():
            from db import (
                db_create_pages,
                db_get,
                db_update,
                db_update_page_done,
                db_update_page_error,
            )
            from routes.extract import run_auto_extract

            u = db_get(uid)
            if not u:
                return

            pdf_key = u["pdf_path"]  # Now a Minio key like "abc123.pdf"

            # Step 1: Render pages as images (skip for image uploads)
            if pdf_key:
                try:
                    db_update(uid, state="rendering", message="Rendering PDF pages...")

                    pdf_bytes = storage.get_pdf(uid)

                    def _on_page(page_num, total):
                        db_update(uid, total_pages=total,
                                  message=f"Rendered page {page_num}/{total}")

                    total = render_and_save_pdf(uid, pdf_bytes, on_page=_on_page)
                    del pdf_bytes

                    db_create_pages(uid, list(range(1, total + 1)))
                    db_update(uid, message=f"Rendered {total} pages")
                except Exception as e:
                    db_update(uid, state="error", message=f"Render failed: {e}")
                    return
            else:
                # Image upload — pages already saved to Minio
                page_files = storage.list_page_images(uid)
                total = len(page_files)
                if total == 0:
                    db_update(uid, state="error", message="No page images found")
                    return

                db_update(uid, total_pages=total, message=f"Found {total} images")

            # Step 2: Parse pages concurrently (load each image on demand)
            db_update(uid, state="parsing", message=f"Starting parse ({PARSE_WORKERS} workers)...")
            done_count = 0
            lock = threading.Lock()

            def _parse_one(page_num):
                nonlocal done_count
                try:
                    img_bytes = storage.get_page_image(uid, page_num)
                    img = Image.open(BytesIO(img_bytes))
                    markdown = parse_page(img, server_url)
                    del img, img_bytes
                    with app.app_context():
                        db_update_page_done(uid, page_num, markdown)
                except Exception as e:
                    with app.app_context():
                        db_update_page_error(uid, page_num, str(e))
                with lock:
                    done_count += 1
                    with app.app_context():
                        db_update(uid, current_page=done_count,
                                  message=f"Parsed {done_count}/{total}")

            with ThreadPoolExecutor(max_workers=PARSE_WORKERS) as pool:
                futures = {
                    pool.submit(_parse_one, i + 1): i + 1
                    for i in range(total)
                }
                for fut in as_completed(futures):
                    fut.result()

            db_update(uid, state="done", current_page=total,
                      message=f"Done — {total} pages parsed")
            run_auto_extract(uid)

    threading.Thread(target=_run, daemon=True).start()


def resume_parse_job(uid: str, server_url: str, app: Flask):
    """Resume parsing for pages still pending or errored."""
    def _run():
        with app.app_context():
            from db import (
                db_get,
                db_get_pending_page_nums,
                db_reset_error_pages,
                db_update,
                db_update_page_done,
                db_update_page_error,
            )
            from routes.extract import run_auto_extract

            u = db_get(uid)
            if not u:
                return

            total = u["total_pages"]

            # If no pages recorded, start fresh
            if total == 0:
                run_parse_job(uid, server_url, app)
                return

            # Check if page images exist in Minio
            page_files = storage.list_page_images(uid)
            if not page_files:
                run_parse_job(uid, server_url, app)
                return

            pending = db_get_pending_page_nums(uid)
            db_reset_error_pages(uid)

            if not pending:
                db_update(uid, state="done", current_page=total,
                          message=f"Done — {total} pages parsed")
                run_auto_extract(uid)
                return

            already_done = total - len(pending)
            db_update(uid, state="parsing", current_page=already_done,
                      message=f"Resuming — {len(pending)} pages remaining...")
            done_count = already_done
            lock = threading.Lock()

            def _parse_one(page_num):
                nonlocal done_count
                try:
                    img_bytes = storage.get_page_image(uid, page_num)
                    img = Image.open(BytesIO(img_bytes))
                    markdown = parse_page(img, server_url)
                    del img, img_bytes
                    with app.app_context():
                        db_update_page_done(uid, page_num, markdown)
                except Exception as e:
                    with app.app_context():
                        db_update_page_error(uid, page_num, str(e))
                with lock:
                    done_count += 1
                    with app.app_context():
                        db_update(uid, current_page=done_count,
                                  message=f"Parsed {done_count}/{total}")

            with ThreadPoolExecutor(max_workers=PARSE_WORKERS) as pool:
                futures = {
                    pool.submit(_parse_one, pn): pn
                    for pn in pending if storage.page_image_exists(uid, pn)
                }
                for fut in as_completed(futures):
                    fut.result()

            db_update(uid, state="done", current_page=total,
                      message=f"Done — {total} pages parsed")
            run_auto_extract(uid)

    threading.Thread(target=_run, daemon=True).start()
