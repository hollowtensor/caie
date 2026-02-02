from __future__ import annotations

import re
from html.parser import HTMLParser

from .dspy_cleanup import TableClassifier, classify_table
from .schemas import PricelistItem


# ── HTML Table Parser ────────────────────────────────────────────────────


class _TableParser(HTMLParser):
    """Parse HTML tables handling rowspan/colspan and multi-row headers."""

    def __init__(self):
        super().__init__()
        self.tables: list[tuple[list[str], list[dict[str, str]]]] = []
        self._in_table = False
        self._in_thead = False
        self._in_tbody = False
        self._in_cell = False
        self._cell_text = ""
        self._cell_colspan = 1
        self._cell_rowspan = 1
        self._header_rows: list[list[tuple[str, int, int]]] = []
        self._body_rows: list[list[tuple[str, int, int]]] = []
        self._current_row: list[tuple[str, int, int]] = []

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag == "table":
            self._in_table = True
            self._header_rows = []
            self._body_rows = []
        elif tag == "thead":
            self._in_thead = True
        elif tag == "tbody":
            self._in_tbody = True
        elif tag == "tr":
            self._current_row = []
        elif tag in ("th", "td"):
            self._in_cell = True
            self._cell_text = ""
            self._cell_colspan = int(attrs_d.get("colspan", 1))
            self._cell_rowspan = int(attrs_d.get("rowspan", 1))

    def handle_endtag(self, tag):
        if tag in ("th", "td") and self._in_cell:
            self._in_cell = False
            text = self._cell_text.strip()
            self._current_row.append((text, self._cell_colspan, self._cell_rowspan))
        elif tag == "tr":
            if self._in_thead:
                self._header_rows.append(self._current_row)
            elif self._in_tbody:
                self._body_rows.append(self._current_row)
            else:
                if not self._header_rows:
                    self._header_rows.append(self._current_row)
                else:
                    self._body_rows.append(self._current_row)
            self._current_row = []
        elif tag == "thead":
            self._in_thead = False
        elif tag == "tbody":
            self._in_tbody = False
        elif tag == "table":
            self._in_table = False
            headers = self._resolve_headers(self._header_rows)
            rows = self._resolve_body(self._body_rows, len(headers))
            if headers:
                dict_rows = []
                for row_cells in rows:
                    padded = row_cells + [""] * (len(headers) - len(row_cells))
                    dict_rows.append(
                        {headers[i]: padded[i] for i in range(len(headers))}
                    )
                self.tables.append((headers, dict_rows))

    def handle_data(self, data):
        if self._in_cell:
            self._cell_text += data

    def _resolve_headers(
        self, header_rows: list[list[tuple[str, int, int]]]
    ) -> list[str]:
        if not header_rows:
            return []
        if len(header_rows) == 1:
            result = []
            for text, colspan, _ in header_rows[0]:
                for _ in range(colspan):
                    result.append(text)
            return result

        max_cols = 0
        for row in header_rows:
            max_cols = max(max_cols, sum(cs for _, cs, _ in row))

        grid = [[""] * max_cols for _ in range(len(header_rows))]
        for r_idx, row in enumerate(header_rows):
            col = 0
            for text, colspan, rowspan in row:
                while col < max_cols and grid[r_idx][col] != "":
                    col += 1
                if col >= max_cols:
                    break
                for dr in range(rowspan):
                    for dc in range(colspan):
                        ri, ci = r_idx + dr, col + dc
                        if ri < len(grid) and ci < max_cols:
                            grid[ri][ci] = text
                col += colspan

        result = []
        for c in range(max_cols):
            val = ""
            for r in range(len(grid)):
                if grid[r][c]:
                    val = grid[r][c]
            result.append(val)
        return result

    def _resolve_body(
        self, body_rows: list[list[tuple[str, int, int]]], num_cols: int
    ) -> list[list[str]]:
        if not body_rows:
            return []
        n_rows = len(body_rows)
        grid = [[""] * num_cols for _ in range(n_rows + 10)]
        occupied = [[False] * num_cols for _ in range(n_rows + 10)]

        for r_idx, row in enumerate(body_rows):
            col = 0
            for text, colspan, rowspan in row:
                while col < num_cols and occupied[r_idx][col]:
                    col += 1
                if col >= num_cols:
                    break
                for dr in range(rowspan):
                    for dc in range(colspan):
                        ri, ci = r_idx + dr, col + dc
                        if ri < len(grid) and ci < num_cols:
                            grid[ri][ci] = text
                            occupied[ri][ci] = True
                col += colspan
        return [grid[r] for r in range(n_rows)]


def parse_html_tables(
    html_text: str,
) -> list[tuple[list[str], list[dict[str, str]]]]:
    parser = _TableParser()
    parser.feed(html_text)
    return parser.tables


def parse_markdown_tables(
    text: str,
) -> list[tuple[list[str], list[dict[str, str]]]]:
    lines = text.split("\n")
    tables: list[tuple[list[str], list[dict[str, str]]]] = []
    headers: list[str] = []
    rows: list[dict[str, str]] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if headers and rows:
                tables.append((headers, rows))
                headers, rows = [], []
            continue
        if "|" not in stripped:
            if headers and rows:
                tables.append((headers, rows))
                headers, rows = [], []
            continue
        cells = [c.strip() for c in stripped.split("|")]
        if cells and cells[0] == "":
            cells = cells[1:]
        if cells and cells[-1] == "":
            cells = cells[:-1]
        if not cells:
            continue
        if all(re.match(r"^[-:]+$", c) for c in cells):
            continue
        if not headers:
            headers = cells
        else:
            padded = cells + [""] * (len(headers) - len(cells))
            row = {h: padded[i] for i, h in enumerate(headers) if i < len(padded)}
            rows.append(row)

    if headers and rows:
        tables.append((headers, rows))
    return tables


def extract_tables(
    text: str,
) -> list[tuple[list[str], list[dict[str, str]]]]:
    """Extract tables from OCR text — tries HTML first, falls back to markdown."""
    if "<table" in text.lower():
        tables = parse_html_tables(text)
        if tables:
            return tables
    return parse_markdown_tables(text)


# ── Context extraction (text surrounding tables) ─────────────────────────


def _extract_table_contexts(text: str) -> list[str]:
    """Extract the non-table text preceding each table as context strings."""
    contexts: list[str] = []
    current_lines: list[str] = []
    in_table = False

    for line in text.split("\n"):
        stripped = line.strip()
        if "<table" in stripped.lower():
            # everything collected so far is context for this table
            ctx = " ".join(current_lines).strip()
            # strip HTML tags from context
            ctx = re.sub(r"<[^>]+>", "", ctx).strip()
            contexts.append(ctx)
            current_lines = []
            in_table = True
        elif "</table>" in stripped.lower():
            in_table = False
        elif not in_table:
            clean = re.sub(r"<[^>]+>", "", stripped).strip()
            # skip boilerplate
            if clean and not any(
                skip in clean.lower()
                for skip in ["w.e.f", "se.com", "life is on", "schneider electric"]
            ):
                current_lines.append(clean)

    return contexts


# ── Price parsing (deterministic) ────────────────────────────────────────


def _parse_price(value: str) -> int | str | None:
    v = value.strip().replace(",", "").replace(" ", "")
    if not v or v == "-" or v == "—":
        return None
    if "request" in v.lower():
        return "On Request"
    digits = re.sub(r"[^\d]", "", v)
    if digits:
        return int(digits)
    return None


# ── Page-level parsing ───────────────────────────────────────────────────


def parse_page(
    page_num: int,
    ocr_text: str,
    program: TableClassifier,
) -> list[PricelistItem]:
    """Parse a page: structural table extraction + DSPy column classification."""
    tables = extract_tables(ocr_text)
    if not tables:
        return []

    contexts = _extract_table_contexts(ocr_text)
    items: list[PricelistItem] = []

    for table_idx, (headers, rows) in enumerate(tables):
        if not rows:
            continue

        context = contexts[table_idx] if table_idx < len(contexts) else ""

        # Ask DSPy program to classify this table's columns
        classification = classify_table(
            program=program,
            headers=headers,
            sample_rows=rows[:2],
            context=context,
        )

        if not classification:
            continue

        col_roles = classification.get("columns", {})
        category = classification.get("category", "Unknown")
        subcategory = classification.get("subcategory", "Unknown")

        # Identify columns by role
        ref_cols = [h for h, r in col_roles.items() if r == "reference"]
        price_cols = [h for h, r in col_roles.items() if r == "price"]
        spec_cols = [h for h, r in col_roles.items() if r == "spec"]
        frame_cols = [h for h, r in col_roles.items() if r == "frame"]
        desc_cols = [h for h, r in col_roles.items() if r == "description"]

        if not ref_cols:
            continue

        # Build items deterministically — all values from the HTML parser
        for row in rows:
            ref_value = row.get(ref_cols[0], "").strip()
            ref_value = re.sub(r"[✓✗]", "", ref_value).strip()
            if not ref_value or ref_value == "-":
                continue

            specs: dict[str, str] = {}
            for col in spec_cols:
                val = row.get(col, "").strip()
                if val and val != "-":
                    specs[col] = val

            prices: dict[str, int | str | None] = {}
            for col in price_cols:
                parsed = _parse_price(row.get(col, ""))
                if parsed is not None:
                    prices[col] = parsed

            frame = None
            if frame_cols:
                frame = row.get(frame_cols[0], "").strip() or None

            description = None
            if desc_cols:
                description = row.get(desc_cols[0], "").strip() or None

            try:
                item = PricelistItem(
                    page=page_num,
                    category=category,
                    subcategory=subcategory,
                    frame=frame,
                    description=description,
                    reference=ref_value,
                    specifications=specs,
                    prices=prices,
                )
                items.append(item)
            except Exception:
                continue

    return items
