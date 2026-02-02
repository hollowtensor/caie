from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    send_from_directory,
)

from pricelist.ocr_client import ocr_page, render_pdf_pages

app = Flask(__name__)

# ── Config ───────────────────────────────────────────────────────────
SERVER_URL: str = ""

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
PDF_DIR = os.path.join(DATA_DIR, "pdfs")
PAGES_DIR = os.path.join(DATA_DIR, "pages")
DB_PATH = os.path.join(DATA_DIR, "uploads.db")

for d in (DATA_DIR, PDF_DIR, PAGES_DIR):
    os.makedirs(d, exist_ok=True)


# ── Database ─────────────────────────────────────────────────────────
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS uploads (
                id           TEXT PRIMARY KEY,
                filename     TEXT NOT NULL,
                company      TEXT NOT NULL DEFAULT 'schneider',
                year         INTEGER,
                month        INTEGER,
                pdf_path     TEXT NOT NULL,
                state        TEXT NOT NULL DEFAULT 'queued',
                message      TEXT DEFAULT '',
                total_pages  INTEGER DEFAULT 0,
                current_page INTEGER DEFAULT 0,
                created_at   TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pages (
                upload_id TEXT NOT NULL,
                page_num  INTEGER NOT NULL,
                markdown  TEXT DEFAULT '',
                state     TEXT NOT NULL DEFAULT 'pending',
                error     TEXT,
                PRIMARY KEY (upload_id, page_num)
            )
        """)


init_db()


def db_update(uid: str, **kw):
    with get_db() as conn:
        sets = ", ".join(f"{k}=?" for k in kw)
        conn.execute(f"UPDATE uploads SET {sets} WHERE id=?", [*kw.values(), uid])


def db_get(uid: str) -> dict | None:
    conn = get_db()
    row = conn.execute("SELECT * FROM uploads WHERE id=?", (uid,)).fetchone()
    conn.close()
    return dict(row) if row else None


def db_list() -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT id, filename, company, year, month, state, message,"
        " total_pages, current_page, created_at"
        " FROM uploads ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def db_get_page(uid: str, page_num: int) -> dict | None:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM pages WHERE upload_id=? AND page_num=?", (uid, page_num)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def db_page_states(uid: str) -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT page_num, state FROM pages WHERE upload_id=? ORDER BY page_num",
        (uid,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Routes ───────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", server_url=SERVER_URL)


@app.route("/api/uploads")
def api_uploads():
    return jsonify(db_list())


@app.route("/api/uploads/<uid>")
def api_upload(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404
    return jsonify(u)


@app.route("/api/uploads/<uid>", methods=["DELETE"])
def api_delete_upload(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    # Remove PDF file
    if u.get("pdf_path") and os.path.exists(u["pdf_path"]):
        os.remove(u["pdf_path"])

    # Remove page images
    pages_dir = os.path.join(PAGES_DIR, uid)
    if os.path.isdir(pages_dir):
        shutil.rmtree(pages_dir)

    # Remove DB records
    with get_db() as conn:
        conn.execute("DELETE FROM pages WHERE upload_id=?", (uid,))
        conn.execute("DELETE FROM uploads WHERE id=?", (uid,))

    return jsonify({"ok": True})


@app.route("/upload", methods=["POST"])
def upload():
    if "pdf" not in request.files:
        return jsonify({"error": "No PDF file"}), 400
    f = request.files["pdf"]
    if not f.filename or not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Must be a PDF"}), 400

    company = request.form.get("company", "schneider").strip()
    year = request.form.get("year", "").strip()
    month = request.form.get("month", "").strip()
    srv = request.form.get("server_url", "").strip() or SERVER_URL

    uid = uuid.uuid4().hex[:12]
    pdf_path = os.path.join(PDF_DIR, f"{uid}.pdf")
    f.save(pdf_path)
    os.makedirs(os.path.join(PAGES_DIR, uid), exist_ok=True)

    with get_db() as conn:
        conn.execute(
            "INSERT INTO uploads"
            " (id, filename, company, year, month, pdf_path, state, message)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (uid, f.filename, company,
             int(year) if year else None,
             int(month) if month else None,
             pdf_path, "queued", "Queued"),
        )

    threading.Thread(target=_run_job, args=(uid, srv), daemon=True).start()
    return jsonify({"id": uid})


@app.route("/pages/<uid>/<filename>")
def serve_page(uid: str, filename: str):
    return send_from_directory(os.path.join(PAGES_DIR, uid), filename)


@app.route("/api/uploads/<uid>/pages")
def api_pages(uid: str):
    d = os.path.join(PAGES_DIR, uid)
    if not os.path.isdir(d):
        return jsonify([])
    return jsonify(sorted(f for f in os.listdir(d) if f.endswith(".png")))


@app.route("/api/uploads/<uid>/page-states")
def api_page_states(uid: str):
    return jsonify(db_page_states(uid))


@app.route("/api/uploads/<uid>/page/<int:page_num>")
def api_page_markdown(uid: str, page_num: int):
    p = db_get_page(uid, page_num)
    if not p:
        return jsonify({"error": "Not found"}), 404
    return jsonify(p)


@app.route("/api/uploads/<uid>/status")
def api_status(uid: str):
    def stream():
        last = ""
        while True:
            u = db_get(uid)
            if not u:
                yield 'data: {"error":"not found"}\n\n'
                break
            d = json.dumps({
                k: u[k] for k in ("state", "message", "current_page", "total_pages")
            })
            if d != last:
                yield f"data: {d}\n\n"
                last = d
            if u["state"] in ("done", "error"):
                break
            time.sleep(0.5)
    return Response(stream(), mimetype="text/event-stream")


# ── Background job ───────────────────────────────────────────────────

def _run_job(uid: str, server_url: str):
    u = db_get(uid)
    if not u:
        return

    pdf_path = u["pdf_path"]
    pages_dir = os.path.join(PAGES_DIR, uid)

    # Step 1: Render pages as images
    try:
        db_update(uid, state="rendering", message="Rendering PDF pages...")
        images = render_pdf_pages(pdf_path)
        total = len(images)
        db_update(uid, total_pages=total, message=f"Saving {total} page images...")
        for i, img in enumerate(images):
            img.save(os.path.join(pages_dir, f"page_{i + 1:03d}.png"), "PNG")

        # Insert page rows
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
    OCR_WORKERS = 8
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
            fut.result()  # propagate unexpected exceptions

    db_update(uid, state="done", current_page=total,
              message=f"Done — {total} pages OCR'd")


# ── Main ─────────────────────────────────────────────────────────────

def main():
    global SERVER_URL
    p = argparse.ArgumentParser(description="Pricelist OCR Server")
    p.add_argument("--server-url",
                    default=os.environ.get("LIGHTONOCR_SERVER_URL", "http://localhost:8000/v1"))
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=5001)
    p.add_argument("--debug", action="store_true")
    args = p.parse_args()

    SERVER_URL = args.server_url.rstrip("/")
    print(f"OCR Server: {SERVER_URL}  |  Data: {DATA_DIR}")
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)


if __name__ == "__main__":
    main()
