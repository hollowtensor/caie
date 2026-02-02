# Changelog

## v1.0.0-rc.1 — Release Candidate 1

### Features

#### PDF Parsing & OCR
- Upload PDF pricelists, split into pages, OCR each page via LightOn API
- Resume interrupted parsing from where it left off
- Split view: page image alongside parsed markdown

#### Schema-Based Extraction
- Define extraction schemas with row anchor, value anchor, and extra columns
- Melt/unpivot for variable child columns (e.g. voltage variants)
- Save schemas per company with set-default support
- Auto-extraction on upload completion using default schema

#### Data Table & Results
- Full-featured data table with sorting, filtering, pagination
- "View Results" from progress card with auto-run extraction
- Download extracted data as CSV

#### Anomaly Detection
- Statistical per-column profiling (length, digit ratio, frequency)
- Flag cells with unusual values (non-numeric in numeric columns, outlier lengths, rare patterns)
- Case-insensitive frequency counting to reduce false positives
- Flagged-only filter toggle in data table

#### Row Inspection & Page Preview
- Click any row to open side panel with source PDF page
- Tabs: Parsed (markdown) and Image views
- Zoom controls on image view
- Source table highlighted in parsed markdown view with "Source Table" label
- Table region estimation for overlay positioning

#### VLM Table Validation (Vision Language Model)
- Send page image to VLM for fresh table re-OCR
- Heading-based table identification (no original HTML sent as reference)
- Pricelist-aware prompt: colspan/rowspan, product references, price values
- Side-by-side review: original OCR vs VLM re-OCR
- Accept to replace table in markdown and re-run extraction, or reject
- "No OCR errors detected" feedback when tables match
- Configurable VLM server URL and model (LM Studio / RunPod compatible)

#### LLM Table Correction (Text-Based)
- Programmatic structural analysis: row-by-row column counts with rowspan tracking
- Feeds exact diagnosis to LLM (mismatched columns, wrong rowspans)
- Full page markdown context for informed corrections
- Separate VLM (blue) and LLM (violet) buttons in preview panel
- Configurable LLM server URL and model

#### UI/UX
- Glassmorphic sticky validation toolbar in preview panel
- Preview panel expands to 60% when row selected
- Auto-disable flagged filter when all corrections accepted
- Company-specific settings page for extraction configs

### Architecture
- **Server**: Flask + SQLite, Blueprint-based routes
- **Client**: React + Vite + TypeScript + Tailwind CSS
- **OCR**: LightOn API (configurable endpoint)
- **VLM**: OpenAI-compatible API (LM Studio / RunPod)
- **LLM**: OpenAI-compatible API (LM Studio / RunPod)
- **Table parsing**: HTML table extraction with regex-based splitting
- **Data table**: @tanstack/react-table with sorting, filtering, pagination

### Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `LIGHTONOCR_SERVER_URL` | `http://localhost:8000/v1` | OCR API endpoint |
| `VLM_SERVER_URL` | `http://localhost:1234/v1` | VLM server (LM Studio) |
| `VLM_MODEL` | `qwen/qwen3-vl-8b` | Vision language model |
| `LLM_SERVER_URL` | `http://localhost:1234/v1` | LLM server (LM Studio) |
| `LLM_MODEL` | `gpt-oss-20b` | Text language model |
