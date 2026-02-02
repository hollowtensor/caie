from __future__ import annotations

import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from ..config import PAGES_DIR
from ..db import db_get, db_update, get_db
from ..pricelist.ocr_client import ocr_page, render_pdf_pages

OCR_WORKERS = 8


def run_ocr_job(uid: str, server_url: str):
    """Background job: render PDF pages, then OCR them concurrently."""
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

    # Step 2: OCR pages concurrently
    db_update(uid, state="ocr", message=f"Starting OCR ({OCR_WORKERS} workers)...")
    done_count = 0
    lock = threading.Lock()

    def _ocr_one(page_num, img):
        nonlocal done_count
        try:
            markdown = ocr_page(img, server_url)
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
                      message=f"OCR {done_count}/{total}")

    with ThreadPoolExecutor(max_workers=OCR_WORKERS) as pool:
        futures = {
            pool.submit(_ocr_one, i + 1, img): i + 1
            for i, img in enumerate(images)
        }
        for fut in as_completed(futures):
            fut.result()

    db_update(uid, state="done", current_page=total,
              message=f"Done — {total} pages OCR'd")
