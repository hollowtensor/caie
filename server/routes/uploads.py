from __future__ import annotations

import json
import os
import shutil
import threading
import time
import uuid

from flask import Blueprint, Response, jsonify, request

from ..config import PAGES_DIR, PDF_DIR, SERVER_URL
from ..db import db_get, db_list, db_update, get_db
from ..tasks.parse import resume_parse_job, run_parse_job

bp = Blueprint("uploads", __name__)


@bp.route("/api/uploads")
def list_uploads():
    return jsonify(db_list())


@bp.route("/api/uploads/<uid>")
def get_upload(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404
    return jsonify(u)


@bp.route("/api/uploads/<uid>", methods=["DELETE"])
def delete_upload(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    if u.get("pdf_path") and os.path.exists(u["pdf_path"]):
        os.remove(u["pdf_path"])

    pages_dir = os.path.join(PAGES_DIR, uid)
    if os.path.isdir(pages_dir):
        shutil.rmtree(pages_dir)

    with get_db() as conn:
        conn.execute("DELETE FROM pages WHERE upload_id=?", (uid,))
        conn.execute("DELETE FROM uploads WHERE id=?", (uid,))

    return jsonify({"ok": True})


ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg"}


@bp.route("/upload", methods=["POST"])
def upload():
    files = request.files.getlist("file")
    if not files or not files[0].filename:
        return jsonify({"error": "No file provided"}), 400

    # Validate extensions
    for f in files:
        ext = os.path.splitext(f.filename or "")[1].lower()
        if ext not in ALLOWED_EXT:
            return jsonify({"error": f"Unsupported file type: {ext}"}), 400

    company = request.form.get("company", "schneider").strip()
    year = request.form.get("year", "").strip()
    month = request.form.get("month", "").strip()
    srv = request.form.get("server_url", "").strip() or SERVER_URL

    uid = uuid.uuid4().hex[:12]
    pages_dir = os.path.join(PAGES_DIR, uid)
    os.makedirs(pages_dir, exist_ok=True)

    first_ext = os.path.splitext(files[0].filename or "")[1].lower()
    is_pdf = first_ext == ".pdf"

    if is_pdf:
        # PDF flow — save PDF, rendering happens in parse job
        pdf_path = os.path.join(PDF_DIR, f"{uid}.pdf")
        files[0].save(pdf_path)
        filename = files[0].filename
    else:
        # Image flow — save images directly as page PNGs
        pdf_path = ""
        filename = files[0].filename if len(files) == 1 else f"{len(files)} images"
        from PIL import Image as PILImage
        for i, f in enumerate(sorted(files, key=lambda f: f.filename or ""), start=1):
            img = PILImage.open(f.stream).convert("RGB")
            img.save(os.path.join(pages_dir, f"page_{i:03d}.png"), "PNG")

    with get_db() as conn:
        conn.execute(
            "INSERT INTO uploads"
            " (id, filename, company, year, month, pdf_path, state, message, total_pages)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (uid, filename, company,
             int(year) if year else None,
             int(month) if month else None,
             pdf_path, "queued", "Queued",
             0 if is_pdf else len(files)),
        )
        if not is_pdf:
            for i in range(1, len(files) + 1):
                conn.execute(
                    "INSERT OR IGNORE INTO pages (upload_id, page_num, state)"
                    " VALUES (?,?,?)",
                    (uid, i, "pending"),
                )

    threading.Thread(target=run_parse_job, args=(uid, srv), daemon=True).start()
    return jsonify({"id": uid})


@bp.route("/api/uploads/<uid>/resume", methods=["POST"])
def resume(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404
    if u["state"] == "done":
        return jsonify({"error": "Already complete"}), 400
    srv = request.json.get("server_url", "") if request.is_json else ""
    srv = srv.strip() or SERVER_URL
    threading.Thread(target=resume_parse_job, args=(uid, srv), daemon=True).start()
    return jsonify({"ok": True})


@bp.route("/api/uploads/<uid>/status")
def upload_status(uid: str):
    def stream():
        last = ""
        while True:
            u = db_get(uid)
            if not u:
                yield 'data: {"error":"not found"}\n\n'
                break
            d = json.dumps({
                k: u[k] for k in ("state", "message", "current_page", "total_pages", "extract_state")
            })
            if d != last:
                yield f"data: {d}\n\n"
                last = d
            if u["state"] in ("done", "error"):
                # Keep streaming if auto-extraction is still running
                ext = u.get("extract_state")
                if ext != "running":
                    break
            time.sleep(0.5)
    return Response(stream(), mimetype="text/event-stream")
