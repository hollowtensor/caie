from __future__ import annotations

import re

from bs4 import BeautifulSoup


def normalize_col(name: str) -> str:
    """Normalize column name for CSV export."""
    name = name.replace("₹", "INR")
    name = re.sub(r"\s+", "_", name.strip())
    name = re.sub(r"[^\w|]", "_", name)
    name = re.sub(r"_+", "_", name).strip("_").lower()
    return name


def _parse_table(table_tag) -> dict | None:
    """Parse a single <table> BeautifulSoup tag into structured data.

    Returns dict with:
        column_info: list of {parent, child, display, normalized}
        columns:     list of normalized column names (backward compat)
        display_columns: list of display column names (backward compat)
        rows:        list of list of str
    """
    thead = table_tag.find("thead")
    tbody = table_tag.find("tbody")

    if thead:
        header_rows = thead.find_all("tr")
        body_rows = tbody.find_all("tr") if tbody else []
    else:
        # No <thead>: contiguous block of rows with <th> at top = headers
        all_rows = table_tag.find_all("tr", recursive=False)
        if not all_rows:
            # Try without recursive=False (some tables nest <tr> inside implicit tbody)
            all_rows = table_tag.find_all("tr")
        header_rows = []
        body_rows = []
        header_done = False
        for row in all_rows:
            if not header_done and row.find("th"):
                header_rows.append(row)
            else:
                header_done = True
                body_rows.append(row)
        # If no <th> found, treat first row as header
        if not header_rows and all_rows:
            header_rows = [all_rows[0]]
            body_rows = all_rows[1:]

    if not header_rows:
        return None

    n_header_rows = len(header_rows)

    # Determine number of columns from header rows
    n_cols = 0
    for row in header_rows:
        count = 0
        for cell in row.find_all(["th", "td"]):
            count += int(cell.get("colspan", 1))
        n_cols = max(n_cols, count)

    if n_cols == 0:
        return None

    # Build header grid (n_header_rows x n_cols)
    grid: list[list[str | None]] = [[None] * n_cols for _ in range(n_header_rows)]

    for ri, row in enumerate(header_rows):
        ci = 0
        for cell in row.find_all(["th", "td"]):
            # Advance past cells already filled by rowspan from above
            while ci < n_cols and grid[ri][ci] is not None:
                ci += 1
            if ci >= n_cols:
                break

            text = cell.get_text(strip=True)
            rs = int(cell.get("rowspan", 1))
            cs = int(cell.get("colspan", 1))

            for dr in range(rs):
                for dc in range(cs):
                    r, c = ri + dr, ci + dc
                    if r < n_header_rows and c < n_cols:
                        grid[r][c] = text
            ci += cs

    # Build column objects from header grid
    column_info = []
    for ci in range(n_cols):
        levels = []
        for ri in range(n_header_rows):
            val = grid[ri][ci] or ""
            levels.append(val)

        # Deduplicate consecutive identical levels (from rowspan)
        deduped = [levels[0]]
        for lv in levels[1:]:
            if lv != deduped[-1]:
                deduped.append(lv)

        if len(deduped) == 1:
            parent = deduped[0]
            child = ""
            display = parent
        else:
            parent = deduped[0]
            child = deduped[-1]
            display = " | ".join(deduped)

        column_info.append({
            "parent": parent,
            "child": child,
            "display": display,
            "normalized": normalize_col(display),
        })

    # Parse data rows with rowspan tracking
    rows: list[list[str]] = []
    active_spans: dict[int, tuple[str, int]] = {}  # col -> (value, remaining)

    for row in body_rows:
        cells = row.find_all(["td", "th"])
        out_row = [""] * n_cols
        ci = 0
        cell_idx = 0

        while ci < n_cols:
            # Check active rowspan from previous rows
            if ci in active_spans:
                val, remaining = active_spans[ci]
                out_row[ci] = val
                if remaining <= 1:
                    del active_spans[ci]
                else:
                    active_spans[ci] = (val, remaining - 1)
                ci += 1
                continue

            if cell_idx >= len(cells):
                ci += 1
                continue

            cell = cells[cell_idx]
            text = cell.get_text(strip=True)
            rs = int(cell.get("rowspan", 1))
            cs = int(cell.get("colspan", 1))

            for dc in range(cs):
                if ci + dc < n_cols:
                    out_row[ci + dc] = text
                    if rs > 1:
                        active_spans[ci + dc] = (text, rs - 1)

            ci += cs
            cell_idx += 1

        # Replace empty strings with "-"
        out_row = [v if v else "-" for v in out_row]
        rows.append(out_row)

    return {
        "column_info": column_info,
        "columns": [c["normalized"] for c in column_info],
        "display_columns": [c["display"] for c in column_info],
        "rows": rows,
    }


def group_columns_by_parent(columns: list[dict]) -> list[dict]:
    """Group detected columns by their parent header.

    Returns list of dicts: {parent, children, is_flat}
    """
    from collections import OrderedDict

    groups: OrderedDict[str, list[str]] = OrderedDict()
    for ci in columns:
        parent = ci["parent"]
        child = ci["child"]
        if parent not in groups:
            groups[parent] = []
        if child and child not in groups[parent]:
            groups[parent].append(child)

    return [
        {"parent": p, "children": ch, "is_flat": len(ch) == 0}
        for p, ch in groups.items()
    ]


def extract_tables(markdown: str) -> list[dict]:
    """Extract HTML tables from markdown, return structured data with parent/child columns."""
    if not markdown:
        return []

    soup = BeautifulSoup(markdown, "html.parser")
    table_tags = soup.find_all("table")

    if not table_tags:
        return []

    tables = []
    for i, tag in enumerate(table_tags):
        parsed = _parse_table(tag)
        if parsed and parsed["rows"]:
            parsed["index"] = i
            tables.append(parsed)

    return tables
