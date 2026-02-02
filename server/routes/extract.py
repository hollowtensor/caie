from __future__ import annotations

import csv
import re
from io import StringIO

from flask import Blueprint, Response, jsonify, request

from ..db import (
    db_create_schema,
    db_delete_schema,
    db_get,
    db_get_schema,
    db_list_schemas,
    db_update_schema,
    get_db,
)
from ..utils.tables import extract_tables, group_columns_by_parent

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


# ---------- Column Detection ----------

@bp.route("/api/uploads/<uid>/detected-columns")
def detected_columns(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    conn = get_db()
    rows = conn.execute(
        "SELECT markdown FROM pages WHERE upload_id=? AND state='done' ORDER BY page_num",
        (uid,),
    ).fetchall()
    conn.close()

    seen = {}  # normalized -> column_info dict
    for r in rows:
        tables = extract_tables(r["markdown"] or "")
        for t in tables:
            for ci in t.get("column_info", []):
                key = ci["normalized"]
                if key not in seen:
                    seen[key] = ci

    columns = [
        {
            "normalized": v["normalized"],
            "display": v["display"],
            "parent": v["parent"],
            "child": v["child"],
        }
        for v in seen.values()
    ]

    parent_groups = group_columns_by_parent(list(seen.values()))

    return jsonify({"columns": columns, "parent_groups": parent_groups})


# ---------- Extraction helpers ----------

def _find_column(match_parent: str, match_child: str, column_info: list[dict]) -> int | None:
    """Find column index matching parent (and optionally child) via substring."""
    if not match_parent:
        return None
    p_lower = match_parent.lower()
    c_lower = match_child.lower() if match_child else ""

    for i, ci in enumerate(column_info):
        if c_lower:
            if p_lower in ci["parent"].lower() and c_lower in ci["child"].lower():
                return i
        else:
            # Flat column: prefer exact parent with no child
            if p_lower in ci["parent"].lower() and not ci["child"]:
                return i

    # Fallback: match display name (covers flat columns where parent == display)
    if not c_lower:
        for i, ci in enumerate(column_info):
            if p_lower in ci["display"].lower():
                return i

    return None


def _find_melt_columns(match_parent: str, column_info: list[dict]) -> list[tuple[int, str]]:
    """Find all child columns under a matching parent. Returns [(index, child_name)]."""
    if not match_parent:
        return []
    p_lower = match_parent.lower()
    result = []
    for i, ci in enumerate(column_info):
        if p_lower in ci["parent"].lower() and ci["child"]:
            result.append((i, ci["child"]))
    return result


def _find_reverse_melt_columns(match_text: str, column_info: list[dict]) -> list[tuple[int, str]]:
    """Find columns where match_text appears in the child position.

    Used when the melt field's match_parent isn't found as a parent but exists
    as a child (e.g. "Unit MRP" is a child under parents like "Bottom Hole").
    Returns [(index, parent_name)].
    """
    if not match_text:
        return []
    t_lower = match_text.lower()
    result = []
    for i, ci in enumerate(column_info):
        if ci["child"] and t_lower in ci["child"].lower():
            result.append((i, ci["parent"]))
    return result


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


def _discover_melt_children(
    fields: list[dict], parsed_pages: list[dict]
) -> dict[str, list[str]]:
    """Pass 1: For each melt field, discover all unique children in order of first appearance."""
    melt_children: dict[str, list[str]] = {}

    for field in fields:
        if not field.get("melt") or field.get("source") != "column":
            continue
        key = field.get("key", "")
        p_lower = field.get("match_parent", "").strip().lower()
        if not p_lower:
            melt_children[key] = []
            continue

        children: list[str] = []
        for pp in parsed_pages:
            for t in pp["tables"]:
                for ci in t.get("column_info", []):
                    # Normal: match_parent is a parent, children are variants
                    if p_lower in ci["parent"].lower() and ci["child"]:
                        if ci["child"] not in children:
                            children.append(ci["child"])
                # Reverse: match_parent appears as a child, parents are variants
                if not any(p_lower in ci["parent"].lower() for ci in t.get("column_info", [])):
                    for ci in t.get("column_info", []):
                        if ci["child"] and p_lower in ci["child"].lower():
                            if ci["parent"] not in children:
                                children.append(ci["parent"])
        melt_children[key] = children

    return melt_children


def _run_extraction(uid: str, fields: list[dict]) -> dict:
    """Two-pass extraction with melt/unpivot support."""
    parsed_pages = _load_pages(uid)

    # Separate regular and melt fields
    regular_fields = [f for f in fields if not f.get("melt")]
    melt_fields = [f for f in fields if f.get("melt") and f.get("source") == "column"]

    # Pass 1: discover melt children
    melt_children = _discover_melt_children(fields, parsed_pages)

    # Build output column headers
    output_columns = []
    for f in regular_fields:
        output_columns.append(f["label"])
    for mf in melt_fields:
        output_columns.append("Variant")
        output_columns.append(mf["label"])

    # Pass 2: extract rows
    output_rows: list[list[str]] = []
    pages_used: set[int] = set()

    for pp in parsed_pages:
        page_num = pp["page_num"]
        heading_text = pp["heading_text"]

        for t in pp["tables"]:
            if not t["rows"]:
                continue
            col_info = t.get("column_info", [])

            # If we have melt fields, check if melt text exists in this table
            # (as parent OR as child in reverse-melt layout)
            if melt_fields:
                any_melt_found = False
                for mf in melt_fields:
                    mp = mf.get("match_parent", "").strip().lower()
                    if not mp:
                        continue
                    if any(mp in ci["parent"].lower() for ci in col_info):
                        any_melt_found = True
                        break
                    if any(ci["child"] and mp in ci["child"].lower() for ci in col_info):
                        any_melt_found = True
                        break
                if not any_melt_found:
                    continue  # skip tables without melt match

            for data_row in t["rows"]:
                # Skip section header rows (same text in all cells)
                unique_vals = set(v for v in data_row if v and v != "-")
                if len(unique_vals) <= 1:
                    continue

                # Extract regular field values
                regular_values: list[str] = []
                for f in regular_fields:
                    if f["source"] == "heading":
                        regular_values.append(heading_text)
                    elif f["source"] == "page":
                        regular_values.append(str(page_num))
                    elif f["source"] == "column":
                        mp = f.get("match_parent", "").strip()
                        mc = f.get("match_child", "").strip()
                        idx = _find_column(mp, mc, col_info)
                        if idx is not None and idx < len(data_row):
                            regular_values.append(str(data_row[idx]))
                        else:
                            regular_values.append("-")
                    else:
                        regular_values.append("-")

                if not melt_fields:
                    # No melt: one output row per data row
                    output_rows.append(regular_values)
                    pages_used.add(page_num)
                else:
                    # Melt: one output row per non-empty child value
                    for mf in melt_fields:
                        mp = mf.get("match_parent", "").strip()
                        children_in_table = _find_melt_columns(mp, col_info)
                        if children_in_table:
                            for col_idx, child_name in children_in_table:
                                if col_idx < len(data_row):
                                    val = str(data_row[col_idx])
                                    if val and val != "-":
                                        out_row = regular_values + [child_name, val]
                                        output_rows.append(out_row)
                                        pages_used.add(page_num)
                        else:
                            # Reverse melt: match text in child position
                            reverse = _find_reverse_melt_columns(mp, col_info)
                            if reverse:
                                for col_idx, parent_name in reverse:
                                    if col_idx < len(data_row):
                                        val = str(data_row[col_idx])
                                        if val and val != "-":
                                            variant = parent_name if len(reverse) > 1 else "-"
                                            out_row = regular_values + [variant, val]
                                            output_rows.append(out_row)
                                            pages_used.add(page_num)
                            else:
                                # Flat fallback: parent exists but no children
                                idx = _find_column(mp, "", col_info)
                                if idx is not None and idx < len(data_row):
                                    val = str(data_row[idx])
                                    if val and val != "-":
                                        out_row = regular_values + ["-", val]
                                        output_rows.append(out_row)
                                        pages_used.add(page_num)

    return {
        "columns": output_columns,
        "rows": output_rows,
        "page_count": len(pages_used),
        "row_count": len(output_rows),
    }


# ---------- Resolve columns (for mapping step) ----------

def _get_fields(data: dict) -> list[dict] | None:
    """Extract fields from request data (schema_id or inline)."""
    if "schema_id" in data:
        schema = db_get_schema(data["schema_id"])
        if not schema:
            return None
        return schema["fields"]
    return data.get("fields")


@bp.route("/api/uploads/<uid>/resolve-columns", methods=["POST"])
def resolve_columns(uid: str):
    """Preview which output columns a schema would produce."""
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(force=True)
    fields = _get_fields(data)
    if fields is None:
        return jsonify({"error": "Provide schema_id or fields"}), 400

    parsed_pages = _load_pages(uid)
    melt_children = _discover_melt_children(fields, parsed_pages)

    field_mappings = []
    for field in fields:
        key = field.get("key", "")
        source = field.get("source", "column")

        if source in ("heading", "page"):
            field_mappings.append({
                "field": field,
                "mode": "auto",
                "matched_children": [],
                "output_columns": [field["label"]],
                "output_count": 1,
            })
        elif field.get("melt"):
            children = melt_children.get(key, [])
            field_mappings.append({
                "field": field,
                "mode": "melt",
                "matched_children": children,
                "output_columns": ["Variant", field["label"]],
                "output_count": 2,
            })
        elif field.get("match_child", "").strip():
            field_mappings.append({
                "field": field,
                "mode": "pin",
                "matched_children": [],
                "output_columns": [field["label"]],
                "output_count": 1,
            })
        else:
            field_mappings.append({
                "field": field,
                "mode": "flat",
                "matched_children": [],
                "output_columns": [field["label"]],
                "output_count": 1,
            })

    total = sum(fm["output_count"] for fm in field_mappings)
    return jsonify({"field_mappings": field_mappings, "total_output_columns": total})


# ---------- Extraction endpoints ----------

@bp.route("/api/uploads/<uid>/extract", methods=["POST"])
def extract_data(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(force=True)
    fields = _get_fields(data)
    if fields is None:
        return jsonify({"error": "Provide schema_id or fields"}), 400

    result = _run_extraction(uid, fields)
    return jsonify(result)


@bp.route("/api/uploads/<uid>/extract/csv", methods=["POST"])
def extract_csv(uid: str):
    u = db_get(uid)
    if not u:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(force=True)
    fields = _get_fields(data)
    if fields is None:
        return jsonify({"error": "Provide schema_id or fields"}), 400

    result = _run_extraction(uid, fields)

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
