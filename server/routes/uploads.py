from __future__ import annotations

import json
import threading
import time
import uuid
from io import BytesIO

from flask import Blueprint, Response, current_app, g, jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

from auth import workspace_required
import config
from db import (
    db_create_pages,
    db_create_upload,
    db_delete_upload,
    db_get,
    db_list,
    db_update,
)
from extensions import db
from models import User
import storage
from tasks.parse import resume_parse_job, run_parse_job

bp = Blueprint("uploads", __name__)


@bp.route("/api/uploads")
@workspace_required
def list_uploads():
    return jsonify(db_list(workspace_id=g.workspace.id))


@bp.route("/api/uploads/<uid>")
@workspace_required
def get_upload(uid: str):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404
    return jsonify(u)


@bp.route("/api/uploads/<uid>", methods=["DELETE"])
@workspace_required
def delete_upload(uid: str):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

    storage.delete_upload_files(uid)
    db_delete_upload(uid)
    return jsonify({"ok": True})


@bp.route("/api/uploads/<uid>", methods=["PUT"])
@workspace_required
def update_upload(uid: str):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(force=True)
    updates = {}

    if "company" in data:
        updates["company"] = data["company"].strip()
    if "year" in data:
        updates["year"] = int(data["year"]) if data["year"] else None
    if "month" in data:
        updates["month"] = int(data["month"]) if data["month"] else None

    if updates:
        db_update(uid, **updates)

    return jsonify(db_get(uid))


ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg"}


@bp.route("/upload", methods=["POST"])
@workspace_required
def upload():
    import os
    from PIL import Image as PILImage

    files = request.files.getlist("file")
    if not files or not files[0].filename:
        return jsonify({"error": "No file provided"}), 400

    for f in files:
        ext = os.path.splitext(f.filename or "")[1].lower()
        if ext not in ALLOWED_EXT:
            return jsonify({"error": f"Unsupported file type: {ext}"}), 400

    company = request.form.get("company", "schneider").strip()
    year = request.form.get("year", "").strip()
    month = request.form.get("month", "").strip()
    srv = request.form.get("server_url", "").strip() or config.SERVER_URL

    uid = uuid.uuid4().hex[:12]

    first_ext = os.path.splitext(files[0].filename or "")[1].lower()
    is_pdf = first_ext == ".pdf"

    if is_pdf:
        pdf_data = files[0].read()
        pdf_key = storage.upload_pdf(uid, pdf_data, files[0].filename)
        filename = files[0].filename
        total_pages = 0
    else:
        pdf_key = ""
        filename = files[0].filename if len(files) == 1 else f"{len(files)} images"
        total_pages = len(files)

        for i, f in enumerate(sorted(files, key=lambda f: f.filename or ""), start=1):
            img = PILImage.open(f.stream).convert("RGB")
            buf = BytesIO()
            img.save(buf, format="PNG")
            storage.upload_page_image(uid, i, buf.getvalue())

    db_create_upload(
        uid=uid,
        filename=filename,
        company=company,
        year=int(year) if year else None,
        month=int(month) if month else None,
        pdf_path=pdf_key,
        state="queued",
        message="Queued",
        total_pages=total_pages,
        workspace_id=g.workspace.id,
        user_id=g.current_user.id,
    )

    if not is_pdf:
        db_create_pages(uid, list(range(1, len(files) + 1)))

    app = current_app._get_current_object()
    threading.Thread(target=run_parse_job, args=(uid, srv, app), daemon=True).start()
    return jsonify({"id": uid})


@bp.route("/api/uploads/<uid>/resume", methods=["POST"])
@workspace_required
def resume(uid: str):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404
    if u["state"] == "done":
        return jsonify({"error": "Already complete"}), 400
    srv = request.json.get("server_url", "") if request.is_json else ""
    srv = srv.strip() or config.SERVER_URL
    app = current_app._get_current_object()
    threading.Thread(target=resume_parse_job, args=(uid, srv, app), daemon=True).start()
    return jsonify({"ok": True})


@bp.route("/api/uploads/<uid>/reparse", methods=["POST"])
@workspace_required
def reparse(uid: str):
    """Force reparse the document, clearing all existing parsing and extraction data."""
    from db import db_reset_all_pages

    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

    # Delete extraction CSV if exists
    csv_filename = u.get("extract_csv")
    if csv_filename:
        try:
            storage.delete_csv(csv_filename)
        except Exception:
            pass  # Ignore if file doesn't exist

    # Reset upload state and clear extraction
    db_update(
        uid,
        state="queued",
        message="Queued for reparse",
        current_page=0,
        extract_state=None,
        extract_csv=None,
    )

    # Reset all pages to pending
    db_reset_all_pages(uid)

    # Start parse job
    srv = request.json.get("server_url", "") if request.is_json else ""
    srv = srv.strip() or config.SERVER_URL
    app = current_app._get_current_object()
    threading.Thread(target=run_parse_job, args=(uid, srv, app), daemon=True).start()

    return jsonify({"ok": True})


@bp.route("/api/uploads/<uid>/status")
def upload_status(uid: str):
    """SSE endpoint for upload status. Accepts token via query param for EventSource."""
    # Authenticate via query param token (EventSource can't set headers)
    token = request.args.get("token")
    if token:
        # Manually set Authorization header for JWT verification
        request.headers = dict(request.headers)
        request.headers["Authorization"] = f"Bearer {token}"

    try:
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
    except Exception:
        return jsonify({"error": "Unauthorized"}), 401

    app = current_app._get_current_object()

    def stream():
        last = ""
        while True:
            with app.app_context():
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
                ext = u.get("extract_state")
                if ext != "running":
                    break
            time.sleep(0.5)
    return Response(stream(), mimetype="text/event-stream")
