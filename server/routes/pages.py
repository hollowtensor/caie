from __future__ import annotations

import base64
import csv
import logging
import re
from io import BytesIO, StringIO

import httpx
from flask import Blueprint, Response, g, jsonify, request
from PIL import Image

from auth import workspace_required
from config import LLM_MODEL, LLM_SERVER_URL, VLM_MODEL, VLM_SERVER_URL
from db import db_get, db_get_page, db_get_parsed_pages, db_page_states, db_update_page
import storage
from utils.tables import extract_tables

log = logging.getLogger(__name__)

bp = Blueprint("pages", __name__)


@bp.route("/pages/<uid>/<filename>")
def serve_page(uid: str, filename: str):
    """Serve page image from Minio. No auth required - UUID provides security."""
    # Verify upload exists (no workspace check - images are public by UUID)
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    match = re.match(r"page_(\d+)\.png", filename)
    if not match:
        return jsonify({"error": "Invalid filename"}), 400

    page_num = int(match.group(1))
    try:
        data = storage.get_page_image(uid, page_num)
        return Response(data, mimetype="image/png")
    except Exception:
        return jsonify({"error": "Page not found"}), 404


@bp.route("/api/uploads/<uid>/pages")
@workspace_required
def list_pages(uid: str):
    """List all page image filenames for an upload."""
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

    files = storage.list_page_images(uid)
    return jsonify(files)


@bp.route("/api/uploads/<uid>/page-states")
@workspace_required
def page_states(uid: str):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404
    return jsonify(db_page_states(uid))


@bp.route("/api/uploads/<uid>/page/<int:page_num>")
@workspace_required
def page_markdown(uid: str, page_num: int):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

    p = db_get_page(uid, page_num)
    if not p:
        return jsonify({"error": "Page not found"}), 404
    return jsonify(p)


@bp.route("/api/uploads/<uid>/markdown")
@workspace_required
def combined_markdown(uid: str):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

    rows = db_get_parsed_pages(uid)

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

    segments: list[tuple] = []
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
@workspace_required
def table_regions(uid: str, page_num: int):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

    p = db_get_page(uid, page_num)
    if not p:
        return jsonify([])
    return jsonify(_estimate_table_regions(p.get("markdown") or ""))


@bp.route("/api/uploads/<uid>/page/<int:page_num>/tables")
@workspace_required
def page_tables(uid: str, page_num: int):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

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
@workspace_required
def page_table_csv(uid: str, page_num: int):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

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


def _image_bytes_to_data_uri(image_bytes: bytes) -> str:
    """Convert PNG bytes to JPEG base64 data URI."""
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
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


def _call_vlm(uid: str, page_num: int, heading: str) -> str:
    """Send page image to VLM and ask it to OCR a specific table from scratch."""
    image_bytes = storage.get_page_image(uid, page_num)
    image_uri = _image_bytes_to_data_uri(image_bytes)

    table_hint = f'The table is under the heading/section: "{heading}"' if heading else "Extract the main table"

    prompt = (
        f"This is a product pricelist page. {table_hint}.\n\n"
        "Extract this table from the image into clean HTML. Read every value directly from the image.\n\n"
        "STRUCTURE:\n"
        "- Use <table>, <thead>, <tbody>, <tr>, <th>, <td> tags.\n"
        "- Use colspan for headers that span multiple columns (e.g. a \"Unit MRP\" header spanning price sub-columns).\n"
        "- Use rowspan for cells that span multiple rows (e.g. a frame/category label covering several product rows).\n"
        "- Put header rows in <thead>, data rows in <tbody>.\n"
        "- Multi-level headers: if there are sub-columns (like voltage variants B5, F5, M5, N5 under a main header), "
        "use two <tr> rows in <thead> with appropriate colspan.\n\n"
        "VALUES:\n"
        "- Copy every cell value exactly: product references (e.g. LC1E06008*IN), prices (e.g. 2290), dashes (-) for unavailable.\n"
        "- Preserve special characters: *, ✓, ₹, etc.\n"
        "- Do NOT skip or merge data rows. Each product row in the image = one <tr> in <tbody>.\n\n"
        "Output ONLY the <table>...</table> HTML. No explanation, no markdown fences.\n"
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

    m = re.search(r"<table[\s\S]*?</table>", content, re.IGNORECASE)
    if m:
        return m.group()
    return content


def _analyze_table(table_html: str) -> str:
    """Analyze table structure and return a diagnosis of issues found."""
    from html.parser import HTMLParser

    class TableAnalyzer(HTMLParser):
        def __init__(self):
            super().__init__()
            self.rows: list[list[dict]] = []
            self.current_row: list[dict] | None = None
            self.current_cell: dict | None = None
            self.in_thead = False
            self.in_tbody = False
            self.thead_rows: list[list[dict]] = []
            self.tbody_rows: list[list[dict]] = []

        def handle_starttag(self, tag, attrs):
            a = dict(attrs)
            if tag == "thead":
                self.in_thead = True
            elif tag == "tbody":
                self.in_tbody = True
            elif tag == "tr":
                self.current_row = []
            elif tag in ("td", "th"):
                self.current_cell = {
                    "tag": tag,
                    "colspan": int(a.get("colspan", 1)),
                    "rowspan": int(a.get("rowspan", 1)),
                    "text": "",
                }

        def handle_endtag(self, tag):
            if tag == "thead":
                self.in_thead = False
            elif tag == "tbody":
                self.in_tbody = False
            elif tag == "tr" and self.current_row is not None:
                if self.in_thead:
                    self.thead_rows.append(self.current_row)
                else:
                    self.tbody_rows.append(self.current_row)
                self.current_row = None
            elif tag in ("td", "th") and self.current_cell is not None:
                if self.current_row is not None:
                    self.current_row.append(self.current_cell)
                self.current_cell = None

        def handle_data(self, data):
            if self.current_cell is not None:
                self.current_cell["text"] += data.strip()

    analyzer = TableAnalyzer()
    analyzer.feed(table_html)

    lines = []

    header_cols = 0
    for i, row in enumerate(analyzer.thead_rows):
        cols = sum(c["colspan"] for c in row)
        lines.append(f"Header row {i}: {cols} columns — [{', '.join(repr(c['text']) for c in row)}]")
        header_cols = max(header_cols, cols)

    active_rowspans: list[int] = []
    issues = []

    for i, row in enumerate(analyzer.tbody_rows):
        inherited = sum(1 for rs in active_rowspans if rs > 0)
        explicit = sum(c["colspan"] for c in row)
        total = inherited + explicit

        cell_texts = [repr(c["text"][:30]) for c in row]
        lines.append(f"Body row {i}: {explicit} explicit cells + {inherited} from rowspan = {total} total — [{', '.join(cell_texts)}]")

        if total != header_cols and header_cols > 0:
            issues.append(f"Row {i}: has {total} columns but header expects {header_cols}")

        new_spans = [0] * max(header_cols, total)
        slot = 0
        rs_idx = 0
        cell_idx = 0
        for s in range(len(new_spans)):
            if rs_idx < len(active_rowspans) and active_rowspans[rs_idx] > 0:
                new_spans[s] = active_rowspans[rs_idx] - 1
                rs_idx += 1
            elif cell_idx < len(row):
                new_spans[s] = row[cell_idx]["rowspan"] - 1
                cell_idx += 1
                rs_idx += 1
            else:
                rs_idx += 1
        active_rowspans = new_spans

    if issues:
        lines.append(f"\nISSUES FOUND: {len(issues)}")
        for issue in issues:
            lines.append(f"  - {issue}")
    else:
        lines.append("\nNo column count mismatches detected.")

    return "\n".join(lines)


def _call_llm(page_markdown: str, table_html: str, heading: str) -> str:
    """Send table + structural diagnosis to LLM for correction."""
    diagnosis = _analyze_table(table_html)

    prompt = (
        "You are fixing an OCR-parsed HTML table from a product pricelist.\n\n"
        f'Table is under the heading: "{heading}"\n\n'
        "--- STRUCTURAL ANALYSIS ---\n"
        f"{diagnosis}\n\n"
        "--- TABLE HTML TO FIX ---\n"
        f"{table_html}\n\n"
        "--- FULL PAGE MARKDOWN (for context) ---\n"
        f"{page_markdown}\n\n"
        "--- INSTRUCTIONS ---\n"
        "Fix the table HTML so that:\n"
        "1. Every row (header and body) has the SAME total column count "
        "(accounting for colspan and rowspan).\n"
        "2. If a header is missing (e.g. body has more columns than header), "
        "add the missing <th> with an appropriate label inferred from the data values.\n"
        "3. If rowspan values are wrong (a group of rows under one label has the wrong count), "
        "fix the rowspan number to match the actual number of rows in that group.\n"
        "4. Preserve ALL cell text values exactly. Do not change, reorder, or remove any data.\n"
        "5. Use <thead>/<tbody> properly.\n\n"
        "Output ONLY the fixed <table>...</table> HTML. No explanation, no markdown fences.\n"
    )

    payload = {
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 8192,
        "temperature": 0.0,
        "stream": False,
    }

    resp = httpx.post(
        f"{LLM_SERVER_URL}/chat/completions",
        json=payload,
        timeout=300.0,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]

    m = re.search(r"<table[\s\S]*?</table>", content, re.IGNORECASE)
    if m:
        return m.group()
    return content


@bp.route("/api/uploads/<uid>/page/<int:page_num>/validate-table", methods=["POST"])
@workspace_required
def validate_table(uid: str, page_num: int):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

    body = request.get_json(force=True) or {}
    table_index = body.get("table_index", 0)
    method = body.get("method", "vlm")

    p = db_get_page(uid, page_num)
    if not p:
        return jsonify({"error": "Page not found"}), 404

    md = p.get("markdown") or ""
    blocks = _get_table_blocks(md)
    if table_index < 0 or table_index >= len(blocks):
        return jsonify({"error": "Table index out of range"}), 404

    original_html = blocks[table_index][2]
    heading = _find_heading_before_table(md, blocks[table_index][0])

    try:
        if method == "llm":
            corrected_html = _call_llm(md, original_html, heading)
        else:
            if not storage.page_image_exists(uid, page_num):
                return jsonify({"error": "Page image not found"}), 404
            corrected_html = _call_vlm(uid, page_num, heading)
    except Exception as e:
        log.exception("%s call failed", method.upper())
        return jsonify({"error": f"{method.upper()} error: {e}"}), 502

    return jsonify({
        "original": original_html,
        "corrected": corrected_html,
    })


@bp.route("/api/uploads/<uid>/page/<int:page_num>/apply-correction", methods=["POST"])
@workspace_required
def apply_correction(uid: str, page_num: int):
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

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

    start, end, _ = blocks[table_index]
    new_md = md[:start] + corrected_table + md[end:]

    db_update_page(uid, page_num, markdown=new_md)

    from routes.extract import run_auto_extract
    run_auto_extract(uid)

    return jsonify({"ok": True})
