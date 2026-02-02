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


@bp.route("/upload", methods=["POST"])
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
                k: u[k] for k in ("state", "message", "current_page", "total_pages")
            })
            if d != last:
                yield f"data: {d}\n\n"
                last = d
            if u["state"] in ("done", "error"):
                break
            time.sleep(0.5)
    return Response(stream(), mimetype="text/event-stream")
