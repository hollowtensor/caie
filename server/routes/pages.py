from __future__ import annotations

import csv
import os
import re
from io import StringIO

from flask import Blueprint, Response, jsonify, request, send_from_directory

from ..config import PAGES_DIR
from ..db import db_get, db_get_page, db_page_states, get_db
from ..utils.tables import extract_tables

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


@bp.route("/api/uploads/<uid>/markdown")
def combined_markdown(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    conn = get_db()
    rows = conn.execute(
        "SELECT page_num, markdown FROM pages"
        " WHERE upload_id=? AND state='done' ORDER BY page_num",
        (uid,),
    ).fetchall()
    conn.close()

    parts = []
    for r in rows:
        parts.append(f"<!-- Page {r['page_num']} -->\n\n{r['markdown'] or ''}")
    combined = "\n\n---\n\n".join(parts)

    basename = u["filename"].rsplit(".", 1)[0] if u.get("filename") else uid
    return Response(
        combined,
        mimetype="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{basename}.md"'},
    )


@bp.route("/api/uploads/<uid>/page/<int:page_num>/tables")
def page_tables(uid: str, page_num: int):
    p = db_get_page(uid, page_num)
    if not p:
        return jsonify({"error": "Not found"}), 404

    md = p.get("markdown") or ""
    headings = re.findall(r"^#+\s+(.+)", md, re.MULTILINE)
    tables = extract_tables(md)

    return jsonify({
        "page_num": page_num,
        "headings": headings,
        "tables": tables,
    })


@bp.route("/api/uploads/<uid>/page/<int:page_num>/tables/csv")
def page_table_csv(uid: str, page_num: int):
    p = db_get_page(uid, page_num)
    if not p:
        return jsonify({"error": "Not found"}), 404

    table_idx = request.args.get("table", 0, type=int)
    tables = extract_tables(p.get("markdown") or "")

    if table_idx < 0 or table_idx >= len(tables):
        return jsonify({"error": "Table index out of range"}), 404

    t = tables[table_idx]
    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(t["display_columns"])
    writer.writerows(t["rows"])

    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="page{page_num}_table{table_idx + 1}.csv"'
        },
    )
