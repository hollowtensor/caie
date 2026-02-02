from __future__ import annotations

import base64
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO

import httpx
import pypdfium2 as pdfium
from PIL import Image

from ..config import PAGES_DIR
from ..db import db_get, db_update, get_db

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
    return page.render(scale=scale * factor, rev_byteorder=True).to_pil()


def render_pdf_pages(pdf_path: str) -> list[Image.Image]:
    pdf = pdfium.PdfDocument(pdf_path)
    images = [render_pdf_page(pdf[i]) for i in range(len(pdf))]
    pdf.close()
    return images


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


def parse_page(image: Image.Image, server_url: str, max_tokens: int = 4096) -> str:
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


def run_parse_job(uid: str, server_url: str):
    """Background job: render PDF pages, then parse them concurrently."""
    u = db_get(uid)
    if not u:
        return

    pdf_path = u["pdf_path"]
    pages_dir = os.path.join(PAGES_DIR, uid)
    os.makedirs(pages_dir, exist_ok=True)

    # Step 1: Render pages as images
    try:
        db_update(uid, state="rendering", message="Rendering PDF pages...")
        images = render_pdf_pages(pdf_path)
        total = len(images)
        db_update(uid, total_pages=total, message=f"Saving {total} page images...")
        for i, img in enumerate(images):
            img.save(os.path.join(pages_dir, f"page_{i + 1:03d}.png"), "PNG")

        with get_db() as conn:
            for i in range(total):
                conn.execute(
                    "INSERT OR IGNORE INTO pages (upload_id, page_num, state)"
                    " VALUES (?,?,?)",
                    (uid, i + 1, "pending"),
                )

        db_update(uid, message=f"Rendered {total} pages")
    except Exception as e:
        db_update(uid, state="error", message=f"Render failed: {e}")
        return

    # Step 2: Parse pages concurrently
    db_update(uid, state="parsing", message=f"Starting parse ({PARSE_WORKERS} workers)...")
    done_count = 0
    lock = threading.Lock()

    def _parse_one(page_num, img):
        nonlocal done_count
        try:
            markdown = parse_page(img, server_url)
            with get_db() as conn:
                conn.execute(
                    "UPDATE pages SET markdown=?, state='done'"
                    " WHERE upload_id=? AND page_num=?",
                    (markdown, uid, page_num),
                )
        except Exception as e:
            with get_db() as conn:
                conn.execute(
                    "UPDATE pages SET state='error', error=?"
                    " WHERE upload_id=? AND page_num=?",
                    (str(e), uid, page_num),
                )
        with lock:
            done_count += 1
            db_update(uid, current_page=done_count,
                      message=f"Parsed {done_count}/{total}")

    with ThreadPoolExecutor(max_workers=PARSE_WORKERS) as pool:
        futures = {
            pool.submit(_parse_one, i + 1, img): i + 1
            for i, img in enumerate(images)
        }
        for fut in as_completed(futures):
            fut.result()

    db_update(uid, state="done", current_page=total,
              message=f"Done — {total} pages parsed")
    from ..routes.extract import run_auto_extract
    run_auto_extract(uid)


def resume_parse_job(uid: str, server_url: str):
    """Resume parsing for pages still pending or errored."""
    u = db_get(uid)
    if not u:
        return

    pdf_path = u["pdf_path"]
    pages_dir = os.path.join(PAGES_DIR, uid)
    total = u["total_pages"]

    # If page images don't exist yet, re-render from PDF
    if total == 0 or not os.path.isdir(pages_dir) or not os.listdir(pages_dir):
        run_parse_job(uid, server_url)
        return

    # Load images from disk
    images = {}
    for i in range(1, total + 1):
        path = os.path.join(pages_dir, f"page_{i:03d}.png")
        if os.path.exists(path):
            images[i] = Image.open(path)

    # Find pages that need parsing
    with get_db() as conn:
        rows = conn.execute(
            "SELECT page_num FROM pages WHERE upload_id=? AND state IN ('pending','error')",
            (uid,),
        ).fetchall()
        pending = [r[0] for r in rows]
        # Reset error pages to pending
        conn.execute(
            "UPDATE pages SET state='pending', error=NULL"
            " WHERE upload_id=? AND state='error'",
            (uid,),
        )

    if not pending:
        db_update(uid, state="done", current_page=total,
                  message=f"Done — {total} pages parsed")
        from ..routes.extract import run_auto_extract
        run_auto_extract(uid)
        return

    already_done = total - len(pending)
    db_update(uid, state="parsing", current_page=already_done,
              message=f"Resuming — {len(pending)} pages remaining...")
    done_count = already_done
    lock = threading.Lock()

    def _parse_one(page_num, img):
        nonlocal done_count
        try:
            markdown = parse_page(img, server_url)
            with get_db() as conn:
                conn.execute(
                    "UPDATE pages SET markdown=?, state='done'"
                    " WHERE upload_id=? AND page_num=?",
                    (markdown, uid, page_num),
                )
        except Exception as e:
            with get_db() as conn:
                conn.execute(
                    "UPDATE pages SET state='error', error=?"
                    " WHERE upload_id=? AND page_num=?",
                    (str(e), uid, page_num),
                )
        with lock:
            done_count += 1
            db_update(uid, current_page=done_count,
                      message=f"Parsed {done_count}/{total}")

    with ThreadPoolExecutor(max_workers=PARSE_WORKERS) as pool:
        futures = {
            pool.submit(_parse_one, pn, images[pn]): pn
            for pn in pending if pn in images
        }
        for fut in as_completed(futures):
            fut.result()

    db_update(uid, state="done", current_page=total,
              message=f"Done — {total} pages parsed")
    from ..routes.extract import run_auto_extract
    run_auto_extract(uid)
