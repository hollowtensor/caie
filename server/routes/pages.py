from __future__ import annotations

import os

from flask import Blueprint, jsonify, send_from_directory

from ..config import PAGES_DIR
from ..db import db_get_page, db_page_states

bp = Blueprint("pages", __name__)


@bp.route("/pages/<uid>/<filename>")
def serve_page(uid: str, filename: str):
    return send_from_directory(os.path.join(PAGES_DIR, uid), filename)


@bp.route("/api/uploads/<uid>/pages")
def list_pages(uid: str):
    d = os.path.join(PAGES_DIR, uid)
    if not os.path.isdir(d):
        return jsonify([])
    return jsonify(sorted(f for f in os.listdir(d) if f.endswith(".png")))


@bp.route("/api/uploads/<uid>/page-states")
def page_states(uid: str):
    return jsonify(db_page_states(uid))


@bp.route("/api/uploads/<uid>/page/<int:page_num>")
def page_markdown(uid: str, page_num: int):
    p = db_get_page(uid, page_num)
    if not p:
        return jsonify({"error": "Not found"}), 404
    return jsonify(p)
