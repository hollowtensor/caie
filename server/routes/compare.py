from __future__ import annotations

import csv
import re
from io import StringIO

from flask import Blueprint, Response, g, jsonify, request

from auth import workspace_required
from db import db_get, db_get_default_schema
from models import Upload
from routes.extract import _extract

bp = Blueprint("compare", __name__)


def _is_valid_product_reference(ref: str) -> bool:
    """Check if reference looks like a valid product code.

    Filters out:
    - Purely numeric values (likely row numbers)
    - Very short values (< 3 chars)
    - Single letters
    """
    if not ref:
        return False

    ref = ref.strip()

    # Too short
    if len(ref) < 3:
        return False

    # Purely numeric (likely row numbers or indices)
    if ref.isdigit():
        return False

    # Must have at least one letter
    if not any(c.isalpha() for c in ref):
        return False

    return True


def _extract_for_comparison(uid: str, config: dict) -> tuple[dict[str, list[dict]], list[str], int]:
    """Extract data using existing extraction logic, filtering out flagged rows.

    Groups items by normalized reference, with variant info preserved for matching.

    Returns:
        tuple: (data_dict keyed by normalized_ref -> list of items, sample_refs, skipped_count)
    """
    # Use existing extraction logic
    result = _extract(uid, config)

    columns = result["columns"]
    rows = result["rows"]
    flags = result["flags"]

    # Find column indices
    row_anchor = config.get("row_anchor", "").lower()
    value_anchor = config.get("value_anchor", "").lower()

    ref_col_idx = None
    val_col_idx = None
    desc_col_idx = None
    variant_col_idx = None
    page_col_idx = None

    for i, col in enumerate(columns):
        col_lower = col.lower()
        if row_anchor in col_lower and ref_col_idx is None:
            ref_col_idx = i
        elif value_anchor in col_lower and val_col_idx is None:
            val_col_idx = i
        elif col_lower == "variant" and variant_col_idx is None:
            variant_col_idx = i
        elif col_lower == "page" and page_col_idx is None:
            page_col_idx = i
        elif ("desc" in col_lower or "product" in col_lower or "name" in col_lower) and desc_col_idx is None:
            desc_col_idx = i

    # Build set of flagged row indices
    flagged_rows = {f["row"] for f in flags}

    # Build result dict, skipping flagged rows and invalid references
    # Key is normalized reference -> list of items (to handle multiple variants)
    data: dict[str, list[dict]] = {}
    sample_refs: list[str] = []
    skipped_count = len(flagged_rows)
    seen_variants: dict[str, set[str]] = {}  # Track seen ref+variant combos

    for row_idx, row in enumerate(rows):
        # Skip flagged rows
        if row_idx in flagged_rows:
            continue

        if ref_col_idx is None or val_col_idx is None:
            continue
        if ref_col_idx >= len(row) or val_col_idx >= len(row):
            continue

        reference = row[ref_col_idx]
        value = row[val_col_idx]

        if not reference or reference == "-":
            continue
        if not value or value == "-":
            continue

        # Skip invalid product references (row numbers, short codes, etc.)
        if not _is_valid_product_reference(reference):
            skipped_count += 1
            continue

        # Get variant if available
        variant = ""
        if variant_col_idx is not None and variant_col_idx < len(row):
            variant = row[variant_col_idx] or ""
            # Treat "-" as empty (common placeholder for missing data)
            if variant.strip() == "-":
                variant = ""

        # Get page number if available
        page = ""
        if page_col_idx is not None and page_col_idx < len(row):
            page = row[page_col_idx] or ""

        # Normalize for matching
        normalized_ref = reference.lower().strip()
        normalized_variant = variant.lower().strip().replace(" ", "")

        # Get description if available
        desc = ""
        if desc_col_idx is not None and desc_col_idx < len(row):
            desc = row[desc_col_idx] or ""

        # Skip duplicate ref+variant combinations
        if normalized_ref not in seen_variants:
            seen_variants[normalized_ref] = set()
        if normalized_variant in seen_variants[normalized_ref]:
            continue
        seen_variants[normalized_ref].add(normalized_variant)

        # Store item grouped by reference
        if normalized_ref not in data:
            data[normalized_ref] = []

        data[normalized_ref].append({
            "ref": reference,
            "variant": variant,
            "normalized_variant": normalized_variant,
            "value": value,
            "desc": desc,
            "page": page,
        })

        if len(sample_refs) < 5:
            display = f"{reference} ({variant})" if variant else reference
            sample_refs.append(display)

    return data, sample_refs, skipped_count


def _parse_price(value: str) -> float | None:
    """Parse a price string to float, handling common formats."""
    if not value:
        return None
    # Remove common currency symbols and whitespace
    cleaned = re.sub(r"[₹$€£,\s]", "", value)
    try:
        return float(cleaned)
    except ValueError:
        return None


def _format_change(base: float | None, target: float | None) -> tuple[str, str]:
    """Format the change and percentage change between two prices."""
    if base is None or target is None:
        return "-", "-"

    change = target - base
    pct = (change / base * 100) if base != 0 else 0

    change_str = f"{change:+.2f}" if change != 0 else "0.00"
    pct_str = f"{pct:+.1f}%" if change != 0 else "0.0%"

    return change_str, pct_str


def _determine_status(
    base_exists: bool, target_exists: bool, base_val: float | None, target_val: float | None
) -> str:
    """Determine row status based on item existence and price comparison."""
    if not base_exists:
        return "NEW"
    if not target_exists:
        return "REMOVED"
    # Both exist - compare prices if parseable
    if base_val is not None and target_val is not None:
        if target_val > base_val:
            return "UP"
        if target_val < base_val:
            return "DOWN"
        return "SAME"
    # One price is parseable, the other isn't (e.g., "On Request")
    if base_val is not None and target_val is None:
        return "UNAVAIL"  # Price became unavailable
    if base_val is None and target_val is not None:
        return "AVAIL"  # Price became available
    # Both unparseable (e.g., both "On Request")
    return "SAME"


@bp.route("/api/uploads/<uid>/comparable", methods=["GET"])
@workspace_required
def get_comparable_uploads(uid: str):
    """Get uploads that can be compared with the given upload."""
    u = db_get(uid)
    if not u or u.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Not found"}), 404

    if u.get("extract_state") != "done":
        return jsonify({"error": "Upload has no extraction results"}), 400

    company = u.get("company")
    if not company:
        return jsonify({"error": "Upload has no company set"}), 400

    # Find other uploads with same company and extraction done
    comparable = Upload.query.filter(
        Upload.workspace_id == g.workspace.id,
        Upload.company == company,
        Upload.extract_state == "done",
        Upload.id != uid,
    ).order_by(Upload.created_at.desc()).all()

    result = []
    for c in comparable:
        result.append({
            "id": c.id,
            "filename": c.filename,
            "company": c.company,
            "year": c.year,
            "month": c.month,
            "total_pages": c.total_pages,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return jsonify(result)


@bp.route("/api/compare", methods=["POST"])
@workspace_required
def compare_extractions():
    """Compare extractions from two uploads."""
    data = request.get_json(force=True)
    base_id = data.get("base_upload_id")
    target_id = data.get("target_upload_id")

    if not base_id or not target_id:
        return jsonify({"error": "Both base_upload_id and target_upload_id required"}), 400

    # Validate uploads
    base_upload = db_get(base_id)
    target_upload = db_get(target_id)

    if not base_upload or base_upload.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Base upload not found"}), 404
    if not target_upload or target_upload.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Target upload not found"}), 404

    if base_upload.get("extract_state") != "done":
        return jsonify({"error": "Base upload has no extraction"}), 400
    if target_upload.get("extract_state") != "done":
        return jsonify({"error": "Target upload has no extraction"}), 400

    # Get extraction config - use provided or default schema
    config = data.get("config")
    if not config:
        company = base_upload.get("company", "")
        schema = db_get_default_schema(company)
        if not schema:
            return jsonify({"error": "No extraction config available"}), 400
        config = schema.get("fields", {})

    if not config.get("row_anchor") or not config.get("value_anchor"):
        return jsonify({"error": "Invalid extraction config"}), 400

    # Extract data from both uploads (skipping flagged items)
    base_data, base_samples, base_skipped = _extract_for_comparison(base_id, config)
    target_data, target_samples, target_skipped = _extract_for_comparison(target_id, config)

    # Count total items
    total_base = sum(len(items) for items in base_data.values())
    total_target = sum(len(items) for items in target_data.values())

    # Build comparison rows with smart matching
    all_refs = set(base_data.keys()) | set(target_data.keys())

    rows = []
    summary = {
        "total_base": total_base,
        "total_target": total_target,
        "matched": 0,
        "added": 0,
        "removed": 0,
        "price_increased": 0,
        "price_decreased": 0,
        "price_unavailable": 0,
        "price_available": 0,
        "unchanged": 0,
        "base_skipped": base_skipped,
        "target_skipped": target_skipped,
    }

    # Debug info for troubleshooting
    debug_info = {
        "base_sample_refs": base_samples,
        "target_sample_refs": target_samples,
        "row_anchor": config.get("row_anchor"),
        "value_anchor": config.get("value_anchor"),
        "base_skipped": base_skipped,
        "target_skipped": target_skipped,
    }

    def add_row(base_item: dict | None, target_item: dict | None):
        """Helper to add a comparison row and update summary."""
        # Get reference display (prefer target, fall back to base)
        ref_display = target_item["ref"] if target_item else base_item["ref"]

        # Get variant (prefer target with content, fall back to base)
        variant = ""
        if target_item and target_item.get("variant"):
            variant = target_item["variant"]
        elif base_item and base_item.get("variant"):
            variant = base_item["variant"]

        # Get description (prefer target, fall back to base)
        desc = ""
        if target_item and target_item.get("desc"):
            desc = target_item["desc"]
        elif base_item and base_item.get("desc"):
            desc = base_item["desc"]

        # Get page numbers
        base_page = base_item.get("page", "") if base_item else ""
        target_page = target_item.get("page", "") if target_item else ""

        # Get prices
        base_price_str = base_item["value"] if base_item else ""
        target_price_str = target_item["value"] if target_item else ""

        base_price = _parse_price(base_price_str) if base_item else None
        target_price = _parse_price(target_price_str) if target_item else None

        # Determine status based on existence and price
        status = _determine_status(
            base_exists=base_item is not None,
            target_exists=target_item is not None,
            base_val=base_price,
            target_val=target_price,
        )

        # Format change
        change_str, pct_str = _format_change(base_price, target_price)

        # Update summary
        if status == "NEW":
            summary["added"] += 1
        elif status == "REMOVED":
            summary["removed"] += 1
        elif status == "UP":
            summary["matched"] += 1
            summary["price_increased"] += 1
        elif status == "DOWN":
            summary["matched"] += 1
            summary["price_decreased"] += 1
        elif status == "UNAVAIL":
            summary["matched"] += 1
            summary["price_unavailable"] += 1
        elif status == "AVAIL":
            summary["matched"] += 1
            summary["price_available"] += 1
        else:  # SAME
            summary["matched"] += 1
            summary["unchanged"] += 1

        # Build row
        rows.append([
            status,
            ref_display,
            variant,
            desc,
            base_price_str,
            target_price_str,
            change_str,
            pct_str,
            base_page,
            target_page,
        ])

    for ref in sorted(all_refs):
        base_items = base_data.get(ref, [])
        target_items = target_data.get(ref, [])

        # Track which items have been matched
        matched_base = set()
        matched_target = set()

        # Pass 1: Match by exact normalized variant
        for bi, base_item in enumerate(base_items):
            for ti, target_item in enumerate(target_items):
                if ti in matched_target:
                    continue
                if base_item["normalized_variant"] == target_item["normalized_variant"]:
                    add_row(base_item, target_item)
                    matched_base.add(bi)
                    matched_target.add(ti)
                    break

        # Pass 2: Match remaining items where one has empty variant
        # (handles case where variant is missing in one document)
        for bi, base_item in enumerate(base_items):
            if bi in matched_base:
                continue
            base_has_variant = bool(base_item["normalized_variant"])

            for ti, target_item in enumerate(target_items):
                if ti in matched_target:
                    continue
                target_has_variant = bool(target_item["normalized_variant"])

                # Match if one side has empty variant
                if not base_has_variant or not target_has_variant:
                    add_row(base_item, target_item)
                    matched_base.add(bi)
                    matched_target.add(ti)
                    break

        # Remaining unmatched base items are REMOVED
        for bi, base_item in enumerate(base_items):
            if bi not in matched_base:
                add_row(base_item, None)

        # Remaining unmatched target items are NEW
        for ti, target_item in enumerate(target_items):
            if ti not in matched_target:
                add_row(None, target_item)

    columns = ["Status", "Reference", "Variant", "Description", "Base Price", "Target Price", "Change", "% Change", "Base Page", "Target Page"]

    return jsonify({
        "base_upload": {
            "id": base_upload["id"],
            "filename": base_upload["filename"],
            "company": base_upload["company"],
            "year": base_upload["year"],
            "month": base_upload["month"],
        },
        "target_upload": {
            "id": target_upload["id"],
            "filename": target_upload["filename"],
            "company": target_upload["company"],
            "year": target_upload["year"],
            "month": target_upload["month"],
        },
        "config": {
            "row_anchor": config.get("row_anchor"),
            "value_anchor": config.get("value_anchor"),
        },
        "debug": debug_info,
        "summary": summary,
        "columns": columns,
        "rows": rows,
    })


@bp.route("/api/compare/csv", methods=["POST"])
@workspace_required
def compare_csv():
    """Download comparison results as CSV."""
    data = request.get_json(force=True)
    base_id = data.get("base_upload_id")
    target_id = data.get("target_upload_id")

    if not base_id or not target_id:
        return jsonify({"error": "Both base_upload_id and target_upload_id required"}), 400

    # Validate uploads
    base_upload = db_get(base_id)
    target_upload = db_get(target_id)

    if not base_upload or base_upload.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Base upload not found"}), 404
    if not target_upload or target_upload.get("workspace_id") != g.workspace.id:
        return jsonify({"error": "Target upload not found"}), 404

    # Get extraction config
    config = data.get("config")
    if not config:
        company = base_upload.get("company", "")
        schema = db_get_default_schema(company)
        if not schema:
            return jsonify({"error": "No extraction config available"}), 400
        config = schema.get("fields", {})

    if not config.get("row_anchor") or not config.get("value_anchor"):
        return jsonify({"error": "Invalid extraction config"}), 400

    # Extract and compare (skipping flagged items)
    base_data, _, _ = _extract_for_comparison(base_id, config)
    target_data, _, _ = _extract_for_comparison(target_id, config)

    all_refs = set(base_data.keys()) | set(target_data.keys())

    columns = ["Status", "Reference", "Variant", "Description", "Base Price", "Target Price", "Change", "% Change", "Base Page", "Target Page"]
    rows = []

    def add_csv_row(base_item: dict | None, target_item: dict | None):
        """Helper to add a CSV row."""
        ref_display = target_item["ref"] if target_item else base_item["ref"]

        variant = ""
        if target_item and target_item.get("variant"):
            variant = target_item["variant"]
        elif base_item and base_item.get("variant"):
            variant = base_item["variant"]

        desc = ""
        if target_item and target_item.get("desc"):
            desc = target_item["desc"]
        elif base_item and base_item.get("desc"):
            desc = base_item["desc"]

        base_page = base_item.get("page", "") if base_item else ""
        target_page = target_item.get("page", "") if target_item else ""

        base_price_str = base_item["value"] if base_item else ""
        target_price_str = target_item["value"] if target_item else ""

        base_price = _parse_price(base_price_str) if base_item else None
        target_price = _parse_price(target_price_str) if target_item else None

        status = _determine_status(
            base_exists=base_item is not None,
            target_exists=target_item is not None,
            base_val=base_price,
            target_val=target_price,
        )
        change_str, pct_str = _format_change(base_price, target_price)

        rows.append([status, ref_display, variant, desc, base_price_str, target_price_str, change_str, pct_str, base_page, target_page])

    for ref in sorted(all_refs):
        base_items = base_data.get(ref, [])
        target_items = target_data.get(ref, [])

        matched_base = set()
        matched_target = set()

        # Pass 1: Match by exact normalized variant
        for bi, base_item in enumerate(base_items):
            for ti, target_item in enumerate(target_items):
                if ti in matched_target:
                    continue
                if base_item["normalized_variant"] == target_item["normalized_variant"]:
                    add_csv_row(base_item, target_item)
                    matched_base.add(bi)
                    matched_target.add(ti)
                    break

        # Pass 2: Match remaining items where one has empty variant
        for bi, base_item in enumerate(base_items):
            if bi in matched_base:
                continue
            base_has_variant = bool(base_item["normalized_variant"])

            for ti, target_item in enumerate(target_items):
                if ti in matched_target:
                    continue
                target_has_variant = bool(target_item["normalized_variant"])

                if not base_has_variant or not target_has_variant:
                    add_csv_row(base_item, target_item)
                    matched_base.add(bi)
                    matched_target.add(ti)
                    break

        # Remaining unmatched base items are REMOVED
        for bi, base_item in enumerate(base_items):
            if bi not in matched_base:
                add_csv_row(base_item, None)

        # Remaining unmatched target items are NEW
        for ti, target_item in enumerate(target_items):
            if ti not in matched_target:
                add_csv_row(None, target_item)

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    writer.writerows(rows)

    base_name = base_upload["filename"].rsplit(".", 1)[0] if base_upload.get("filename") else base_id
    target_name = target_upload["filename"].rsplit(".", 1)[0] if target_upload.get("filename") else target_id

    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{base_name}_vs_{target_name}_comparison.csv"'
        },
    )
