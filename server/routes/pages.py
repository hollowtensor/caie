from __future__ import annotations

import base64
import csv
import logging
import os
import re
from io import BytesIO, StringIO

import httpx
from flask import Blueprint, Response, jsonify, request, send_from_directory
from PIL import Image

from ..config import PAGES_DIR, VLM_MODEL, VLM_SERVER_URL
from ..db import db_get, db_get_page, db_page_states, get_db
from ..utils.tables import extract_tables

log = logging.getLogger(__name__)

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


def _estimate_table_regions(markdown: str) -> list[dict]:
    """Estimate vertical positions of tables on a page from markdown structure."""
    parts = re.split(r"(<table.*?</table>)", markdown, flags=re.DOTALL | re.IGNORECASE)

    segments: list[tuple] = []  # ('text', weight) or ('table', weight, index)
    table_idx = 0

    for part in parts:
        stripped = part.strip()
        if stripped.lower().startswith("<table"):
            row_count = len(re.findall(r"<tr", part, re.IGNORECASE))
            segments.append(("table", max(row_count, 1), table_idx))
            table_idx += 1
        else:
            text_lines = len([l for l in part.split("\n") if l.strip()])
            if text_lines > 0:
                segments.append(("text", text_lines))

    total_weight = sum(s[1] for s in segments)
    if total_weight == 0:
        return []

    regions = []
    current_pos = 0
    for seg in segments:
        if seg[0] == "table":
            regions.append({
                "index": seg[2],
                "top": current_pos / total_weight,
                "height": seg[1] / total_weight,
            })
        current_pos += seg[1]

    return regions


@bp.route("/api/uploads/<uid>/page/<int:page_num>/table-regions")
def table_regions(uid: str, page_num: int):
    p = db_get_page(uid, page_num)
    if not p:
        return jsonify([])
    return jsonify(_estimate_table_regions(p.get("markdown") or ""))


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


# ---------- VLM Table Validation ----------

def _get_table_blocks(markdown: str) -> list[tuple[int, int, str]]:
    """Return list of (start, end, html) for each <table>...</table> in markdown."""
    return [(m.start(), m.end(), m.group()) for m in re.finditer(
        r"<table[\s\S]*?</table>", markdown, re.IGNORECASE
    )]


def _image_to_data_uri(path: str) -> str:
    """Load a PNG, convert to JPEG base64 data URI."""
    img = Image.open(path).convert("RGB")
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/jpeg;base64,{b64}"


def _find_heading_before_table(markdown: str, table_start: int) -> str:
    """Find the nearest markdown heading before the given position."""
    text_before = markdown[:table_start]
    matches = list(re.finditer(r"^#+\s+(.+)", text_before, re.MULTILINE))
    if matches:
        return matches[-1].group(1).strip()
    return ""


def _call_vlm(image_path: str, heading: str) -> str:
    """Send page image to VLM and ask it to OCR a specific table from scratch."""
    image_uri = _image_to_data_uri(image_path)

    table_hint = f'The table is under the heading/section: "{heading}"' if heading else "Extract the main table"

    prompt = (
        f"Look at this page image. {table_hint}.\n\n"
        "Your task: Read this table directly from the image and output it as clean HTML.\n\n"
        "RULES:\n"
        "- Read every cell value exactly as shown in the image.\n"
        "- Use proper <table>, <thead>, <tbody>, <tr>, <th>, <td> tags.\n"
        "- Use colspan/rowspan where the image shows merged cells.\n"
        "- Output ONLY the <table>...</table> HTML, nothing else.\n"
    )

    payload = {
        "model": VLM_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_uri}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "max_tokens": 8192,
        "temperature": 0.0,
        "stream": False,
    }

    resp = httpx.post(
        f"{VLM_SERVER_URL}/chat/completions",
        json=payload,
        timeout=300.0,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]

    # Extract <table>...</table> from response
    m = re.search(r"<table[\s\S]*?</table>", content, re.IGNORECASE)
    if m:
        return m.group()
    return content


@bp.route("/api/uploads/<uid>/page/<int:page_num>/validate-table", methods=["POST"])
def validate_table(uid: str, page_num: int):
    body = request.get_json(force=True) or {}
    table_index = body.get("table_index", 0)

    p = db_get_page(uid, page_num)
    if not p:
        return jsonify({"error": "Page not found"}), 404

    md = p.get("markdown") or ""
    blocks = _get_table_blocks(md)
    if table_index < 0 or table_index >= len(blocks):
        return jsonify({"error": "Table index out of range"}), 404

    original_html = blocks[table_index][2]
    heading = _find_heading_before_table(md, blocks[table_index][0])

    # Find page image
    image_path = os.path.join(PAGES_DIR, uid, f"page_{page_num:03d}.png")
    if not os.path.exists(image_path):
        return jsonify({"error": "Page image not found"}), 404

    try:
        corrected_html = _call_vlm(image_path, heading)
    except Exception as e:
        log.exception("VLM call failed")
        return jsonify({"error": f"VLM error: {e}"}), 502

    return jsonify({
        "original": original_html,
        "corrected": corrected_html,
    })


@bp.route("/api/uploads/<uid>/page/<int:page_num>/apply-correction", methods=["POST"])
def apply_correction(uid: str, page_num: int):
    body = request.get_json(force=True) or {}
    table_index = body.get("table_index")
    corrected_table = body.get("corrected_table")

    if table_index is None or not corrected_table:
        return jsonify({"error": "table_index and corrected_table required"}), 400

    p = db_get_page(uid, page_num)
    if not p:
        return jsonify({"error": "Page not found"}), 404

    md = p.get("markdown") or ""
    blocks = _get_table_blocks(md)
    if table_index < 0 or table_index >= len(blocks):
        return jsonify({"error": "Table index out of range"}), 404

    # Replace the specific table in the markdown
    start, end, _ = blocks[table_index]
    new_md = md[:start] + corrected_table + md[end:]

    # Update DB
    with get_db() as conn:
        conn.execute(
            "UPDATE pages SET markdown=? WHERE upload_id=? AND page_num=?",
            (new_md, uid, page_num),
        )

    # Re-run auto-extract
    from .extract import run_auto_extract
    run_auto_extract(uid)

    return jsonify({"ok": True})
