from __future__ import annotations

import csv
import os
import re
from io import StringIO

import pandas as pd
from flask import Blueprint, Response, jsonify, request, send_from_directory

from ..config import PAGES_DIR
from ..db import db_get, db_get_page, db_page_states, get_db

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


# ---------- Table extraction helpers ----------

def _normalize_col(name: str) -> str:
    """Normalize column name for CSV export."""
    name = name.replace("₹", "INR")
    name = re.sub(r"\s+", "_", name.strip())
    name = re.sub(r"[^\w|]", "_", name)
    name = re.sub(r"_+", "_", name).strip("_").lower()
    return name


def _flatten_columns(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    """Flatten MultiIndex columns into display and normalized names."""
    if isinstance(df.columns, pd.MultiIndex):
        display = []
        for col in df.columns:
            parts = [str(c) for c in col]
            # Deduplicate adjacent same values
            deduped = [parts[0]]
            for p in parts[1:]:
                if p != deduped[-1]:
                    deduped.append(p)
            display.append(" | ".join(deduped))
    else:
        display = [str(c) for c in df.columns]
    normalized = [_normalize_col(d) for d in display]
    return display, normalized


def _extract_tables(markdown: str) -> list[dict]:
    """Extract HTML tables from markdown, return structured data."""
    if not markdown:
        return []
    try:
        dfs = pd.read_html(StringIO(markdown))
    except ValueError:
        return []

    tables = []
    for i, df in enumerate(dfs):
        df = df.fillna("-").astype(str)
        display_cols, norm_cols = _flatten_columns(df)
        df.columns = range(len(df.columns))  # reset for iteration
        rows = df.values.tolist()
        tables.append({
            "index": i,
            "columns": norm_cols,
            "display_columns": display_cols,
            "rows": rows,
        })
    return tables


@bp.route("/api/uploads/<uid>/page/<int:page_num>/tables")
def page_tables(uid: str, page_num: int):
    p = db_get_page(uid, page_num)
    if not p:
        return jsonify({"error": "Not found"}), 404

    md = p.get("markdown") or ""
    headings = re.findall(r"^#+\s+(.+)", md, re.MULTILINE)
    tables = _extract_tables(md)

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
    tables = _extract_tables(p.get("markdown") or "")

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
