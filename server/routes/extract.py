from __future__ import annotations

import csv
import math
import os
import re
from collections import Counter
from io import StringIO

from flask import Blueprint, Response, jsonify, request, send_file

from ..config import OUTPUT_DIR
from ..db import (
    db_create_schema,
    db_delete_schema,
    db_get,
    db_get_default_schema,
    db_get_schema,
    db_list_schemas,
    db_set_default_schema,
    db_update,
    db_update_schema,
    get_db,
)
from ..utils.tables import extract_tables

bp = Blueprint("extract", __name__)


# ---------- Schema CRUD ----------

@bp.route("/api/schemas", methods=["GET"])
def list_schemas():
    company = request.args.get("company")
    return jsonify(db_list_schemas(company))


@bp.route("/api/schemas", methods=["POST"])
def create_schema():
    data = request.get_json(force=True)
    schema = db_create_schema(
        company=data["company"],
        name=data["name"],
        fields=data["fields"],
    )
    return jsonify(schema), 201


@bp.route("/api/schemas/<sid>", methods=["GET"])
def get_schema(sid: str):
    s = db_get_schema(sid)
    if not s:
        return jsonify({"error": "Not found"}), 404
    return jsonify(s)


@bp.route("/api/schemas/<sid>", methods=["PUT"])
def update_schema(sid: str):
    s = db_get_schema(sid)
    if not s:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(force=True)
    kw = {}
    if "name" in data:
        kw["name"] = data["name"]
    if "company" in data:
        kw["company"] = data["company"]
    if "fields" in data:
        kw["fields"] = data["fields"]
    updated = db_update_schema(sid, **kw)
    return jsonify(updated)


@bp.route("/api/schemas/<sid>", methods=["DELETE"])
def delete_schema(sid: str):
    db_delete_schema(sid)
    return jsonify({"ok": True})


@bp.route("/api/schemas/<sid>/set-default", methods=["POST"])
def set_default(sid: str):
    s = db_get_schema(sid)
    if not s:
        return jsonify({"error": "Not found"}), 404
    db_set_default_schema(sid)

    # Re-extract uploads for this company that had no config or errored
    company = s["company"]
    conn = get_db()
    rows = conn.execute(
        "SELECT id FROM uploads WHERE company=? AND state='done'"
        " AND (extract_state IS NULL OR extract_state IN ('no_config', 'error'))",
        (company,),
    ).fetchall()
    conn.close()
    for r in rows:
        run_auto_extract(r["id"])

    return jsonify({"ok": True})


# ---------- Helpers ----------

def _load_pages(uid: str) -> list[dict]:
    """Load and pre-parse all done pages for an upload."""
    conn = get_db()
    rows = conn.execute(
        "SELECT page_num, markdown FROM pages"
        " WHERE upload_id=? AND state='done' ORDER BY page_num",
        (uid,),
    ).fetchall()
    conn.close()

    parsed = []
    for r in rows:
        md = r["markdown"] or ""
        headings = re.findall(r"^#+\s+(.+)", md, re.MULTILINE)
        parsed.append({
            "page_num": r["page_num"],
            "heading_text": " > ".join(headings) if headings else "-",
            "tables": extract_tables(md),
        })
    return parsed


def _derive_variant(display_col: str, anchor: str) -> str:
    """Derive variant name from a display column by removing anchor-matching parts.

    "Unit MRP [₹] | M7 (220V)" + "Unit MRP" → "M7 (220V)"
    "Unit MRP [₹]"             + "Unit MRP" → ""
    "Bottom Hole | Unit MRP [€]" + "Unit MRP" → "Bottom Hole"
    """
    anchor_lower = anchor.lower()
    parts = [p.strip() for p in display_col.split(" | ")]
    remaining = [p for p in parts if anchor_lower not in p.lower()]
    return " | ".join(remaining)


def _find_nearest_left(val_idx: int, ref_indices: list[int]) -> int | None:
    """Find the nearest ref index that is <= val_idx."""
    best = None
    for ri in ref_indices:
        if ri <= val_idx:
            if best is None or ri > best:
                best = ri
    # Fallback: if no ref to the left, use the first ref
    return best if best is not None else (ref_indices[0] if ref_indices else None)


# ---------- Scan ----------

def _scan_tables(uid: str, row_anchor: str, value_anchor: str) -> dict:
    """Scan all tables for anchor matches, return discovery info."""
    parsed_pages = _load_pages(uid)

    ra = row_anchor.lower()
    va = value_anchor.lower()

    tables_found = 0
    pages_found: set[int] = set()
    value_cols_seen: set[str] = set()
    extra_cols_seen: set[str] = set()
    value_columns: list[str] = []
    extra_columns: list[str] = []

    for pp in parsed_pages:
        for t in pp["tables"]:
            dc = t.get("display_columns", [])
            has_ref = any(ra in c.lower() for c in dc)
            has_val = any(va in c.lower() for c in dc)
            if not (has_ref and has_val):
                continue

            tables_found += 1
            pages_found.add(pp["page_num"])

            for c in dc:
                cl = c.lower()
                if va in cl:
                    if c not in value_cols_seen:
                        value_cols_seen.add(c)
                        value_columns.append(c)
                elif ra not in cl:
                    if c not in extra_cols_seen:
                        extra_cols_seen.add(c)
                        extra_columns.append(c)

    return {
        "tables_found": tables_found,
        "pages_found": len(pages_found),
        "value_columns": value_columns,
        "extra_columns": extra_columns,
    }


@bp.route("/api/uploads/<uid>/scan-columns", methods=["POST"])
def scan_columns(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(force=True)
    row_anchor = data.get("row_anchor", "").strip()
    value_anchor = data.get("value_anchor", "").strip()
    if not row_anchor or not value_anchor:
        return jsonify({"error": "Both row_anchor and value_anchor required"}), 400

    result = _scan_tables(uid, row_anchor, value_anchor)
    return jsonify(result)


# ---------- Extraction ----------

def _get_config(data: dict) -> dict | None:
    """Extract config from request (schema_id or inline)."""
    if "schema_id" in data:
        schema = db_get_schema(data["schema_id"])
        if not schema:
            return None
        cfg = schema["fields"]
        # Reject old-format schemas (list instead of dict)
        return cfg if isinstance(cfg, dict) else None
    config = {}
    for key in ("row_anchor", "value_anchor", "extras", "include_page", "include_heading"):
        if key in data:
            config[key] = data[key]
    if not config.get("row_anchor") or not config.get("value_anchor"):
        return None
    return config


def _extract(uid: str, config: dict) -> dict:
    """Flat anchor-based extraction."""
    parsed_pages = _load_pages(uid)

    row_anchor = config.get("row_anchor", "").strip()
    value_anchor = config.get("value_anchor", "").strip()
    extras_list: list[str] = config.get("extras", [])
    include_page = config.get("include_page", False)
    include_heading = config.get("include_heading", False)

    ra = row_anchor.lower()
    va = value_anchor.lower()

    # Determine if we need a Variant column (multiple distinct value columns)
    all_value_display: set[str] = set()
    for pp in parsed_pages:
        for t in pp["tables"]:
            for c in t.get("display_columns", []):
                if va in c.lower():
                    all_value_display.add(c)
    has_variants = len(all_value_display) > 1

    # Build output column headers
    output_columns: list[str] = []
    if include_page:
        output_columns.append("Page")
    if include_heading:
        output_columns.append("Heading")
    output_columns.extend(extras_list)
    output_columns.append(row_anchor)
    if has_variants:
        output_columns.append("Variant")
    output_columns.append(value_anchor)

    # Extract rows
    output_rows: list[list[str]] = []
    pages_used: set[int] = set()

    for pp in parsed_pages:
        page_num = pp["page_num"]
        heading_text = pp["heading_text"]

        for t in pp["tables"]:
            dc = t.get("display_columns", [])
            rows = t.get("rows", [])
            if not rows:
                continue

            ref_indices = [i for i, c in enumerate(dc) if ra in c.lower()]
            val_indices = [i for i, c in enumerate(dc) if va in c.lower()]
            if not ref_indices or not val_indices:
                continue

            # Map extras to column indices in this table (None if missing)
            extra_indices: list[int | None] = []
            for ext in extras_list:
                ext_lower = ext.lower()
                found = None
                for i, c in enumerate(dc):
                    if c.lower() == ext_lower:
                        found = i
                        break
                extra_indices.append(found)

            for data_row in rows:
                # Skip section header rows (all non-empty cells identical)
                unique_vals = set(v for v in data_row if v and v != "-")
                if len(unique_vals) <= 1:
                    continue

                for vi in val_indices:
                    if vi >= len(data_row):
                        continue
                    value = data_row[vi]
                    if not value or value == "-":
                        continue

                    ri = _find_nearest_left(vi, ref_indices)
                    if ri is None:
                        continue
                    reference = data_row[ri] if ri < len(data_row) else "-"

                    out: list[str] = []
                    if include_page:
                        out.append(str(page_num))
                    if include_heading:
                        out.append(heading_text)
                    for ei in extra_indices:
                        out.append(data_row[ei] if ei is not None and ei < len(data_row) else "-")
                    out.append(reference)
                    if has_variants:
                        variant = _derive_variant(dc[vi], value_anchor)
                        out.append(variant if variant else "-")
                    out.append(value)

                    output_rows.append(out)
                    pages_used.add(page_num)

    flags = _detect_anomalies(output_columns, output_rows)

    return {
        "columns": output_columns,
        "rows": output_rows,
        "flags": flags,
        "flagged_count": len({f["row"] for f in flags}),
        "page_count": len(pages_used),
        "row_count": len(output_rows),
    }


# ---------- Anomaly Detection ----------

def _is_numeric(v: str) -> bool:
    """Check if a string represents a number (after stripping commas/spaces)."""
    v = v.replace(",", "").replace(" ", "").strip()
    if not v:
        return False
    try:
        float(v)
        return True
    except ValueError:
        return False


def _percentile(sorted_vals: list[float], p: float) -> float:
    """Compute percentile from a sorted list."""
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * (p / 100)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def _profile_column(values: list[str]) -> dict:
    """Build a statistical profile for a column's values."""
    if not values:
        return {"skip": True}

    lengths = sorted(len(v) for v in values)
    digit_ratios = sorted(
        sum(c.isdigit() for c in v) / max(len(v), 1) for v in values
    )
    numeric_count = sum(1 for v in values if _is_numeric(v))
    freq = Counter(values)
    # Common threshold: ≥1% of total values (min 5)
    common_threshold = max(5, len(values) * 0.01)

    q1_len = _percentile(lengths, 25)
    q3_len = _percentile(lengths, 75)
    iqr_len = q3_len - q1_len
    # Ensure minimum lower bound of 2 chars
    lower_len = max(q1_len - 1.5 * iqr_len, 1)
    upper_len = q3_len + 1.5 * iqr_len

    median_dr = _percentile(digit_ratios, 50)

    return {
        "skip": False,
        "numeric_ratio": numeric_count / len(values),
        "is_numeric_col": numeric_count / len(values) > 0.7,
        "lower_len": lower_len,
        "upper_len": upper_len,
        "q1_len": q1_len,
        "q3_len": q3_len,
        "digit_ratio_median": median_dr,
        "freq": freq,
        "common_threshold": common_threshold,
    }


def _check_cell(value: str, profile: dict) -> str | None:
    """Check a single cell value against its column profile. Return reason or None."""
    if profile.get("skip") or not value or value == "-":
        return None

    freq = profile["freq"]
    threshold = profile.get("common_threshold", 5)
    is_common = freq.get(value, 0) >= threshold

    # Common values are exempt from all checks — they appear enough to be intentional
    if is_common:
        return None

    # Check 1: numeric column has non-numeric value
    if profile["is_numeric_col"] and not _is_numeric(value):
        return "non-numeric in price column"

    # Check 2: unusual length
    vlen = len(value)
    lower = profile["lower_len"]
    upper = profile["upper_len"]
    if vlen < lower:
        return f"unusual length ({vlen} char{'s' if vlen != 1 else ''}, expected {int(lower)}-{int(upper)})"
    if vlen > upper:
        return f"unusual length ({vlen} chars, expected {int(lower)}-{int(upper)})"

    # Check 3: unusual character composition
    dr = sum(c.isdigit() for c in value) / max(len(value), 1)
    if abs(dr - profile["digit_ratio_median"]) > 0.5:
        return "unusual character pattern"

    return None


def _detect_anomalies(columns: list[str], rows: list[list[str]]) -> list[dict]:
    """Profile each column and flag anomalous cells."""
    if not rows or not columns:
        return []

    n_cols = len(columns)

    # Skip metadata columns (Page, Heading) — only profile data columns
    skip_cols = {"page", "heading", "variant"}
    profiles = []
    for ci in range(n_cols):
        col_lower = columns[ci].lower()
        if col_lower in skip_cols:
            profiles.append({"skip": True})
        else:
            col_values = [r[ci] for r in rows if ci < len(r) and r[ci] and r[ci] != "-"]
            profiles.append(_profile_column(col_values))

    flags = []
    for ri, row in enumerate(rows):
        for ci in range(min(len(row), n_cols)):
            reason = _check_cell(row[ci], profiles[ci])
            if reason:
                flags.append({"row": ri, "col": ci, "reason": reason})

    return flags


@bp.route("/api/uploads/<uid>/extract", methods=["POST"])
def extract_data(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(force=True)
    config = _get_config(data)
    if config is None:
        return jsonify({"error": "Provide valid config or schema_id"}), 400

    result = _extract(uid, config)
    return jsonify(result)


@bp.route("/api/uploads/<uid>/extract/csv", methods=["POST"])
def extract_csv(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(force=True)
    config = _get_config(data)
    if config is None:
        return jsonify({"error": "Provide valid config or schema_id"}), 400

    result = _extract(uid, config)

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(result["columns"])
    writer.writerows(result["rows"])

    basename = u["filename"].rsplit(".", 1)[0] if u.get("filename") else uid
    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{basename}_extract.csv"'
        },
    )


# ---------- Auto-extraction ----------

def run_auto_extract(uid: str):
    """Auto-extract after parsing completes, using the company's default config."""
    u = db_get(uid)
    if not u:
        return

    company = u.get("company", "")
    schema = db_get_default_schema(company)
    if not schema:
        db_update(uid, extract_state="no_config")
        return

    cfg = schema["fields"]
    if not isinstance(cfg, dict) or not cfg.get("row_anchor") or not cfg.get("value_anchor"):
        db_update(uid, extract_state="no_config")
        return

    try:
        db_update(uid, extract_state="running")
        result = _extract(uid, cfg)

        # Write CSV to OUTPUT_DIR
        csv_filename = f"{uid}_extract.csv"
        csv_path = os.path.join(OUTPUT_DIR, csv_filename)
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(result["columns"])
            writer.writerows(result["rows"])

        db_update(uid, extract_state="done", extract_csv=csv_filename)
    except Exception as e:
        db_update(uid, extract_state="error")


@bp.route("/api/uploads/<uid>/extract/download")
def extract_download(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    csv_filename = u.get("extract_csv")
    if not csv_filename:
        return jsonify({"error": "No extraction available"}), 404

    csv_path = os.path.join(OUTPUT_DIR, csv_filename)
    if not os.path.exists(csv_path):
        return jsonify({"error": "CSV file not found"}), 404

    basename = u["filename"].rsplit(".", 1)[0] if u.get("filename") else uid
    return send_file(
        csv_path,
        mimetype="text/csv",
        as_attachment=True,
        download_name=f"{basename}_extract.csv",
    )
