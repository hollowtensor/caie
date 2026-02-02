# CAIE — Context-Aware Information Extraction

Extract structured data from PDF pricelists using OCR and LLMs.

Upload a PDF, OCR every page via [LightOnOCR-2](https://huggingface.co/lightonai/LightOnOCR-2-1B) running on vLLM, browse rendered pages, and view the extracted markdown.

## Architecture

```
Browser (Flask UI)
    │
    ├── Upload PDF → save locally, render pages as images
    │
    └── OCR (8 concurrent workers) ──► vLLM server (LightOnOCR-2-1B)
                                           on RunPod GPU
```

- **Flask app** — two-panel UI with upload form, page thumbnails, and markdown viewer
- **SQLite** — persists uploads and per-page OCR results across restarts
- **vLLM** — serves LightOnOCR-2-1B as an OpenAI-compatible API
- **Concurrent OCR** — 8 pages in flight at once via ThreadPoolExecutor

## Project Structure

```
app.py                  Flask server (upload, OCR jobs, markdown viewer)
templates/index.html    Two-panel web UI
pricelist/
  ocr_client.py         PDF rendering (pypdfium2) + OCR API client
  pipeline.py           Full extraction pipeline (OCR + LLM parsing)
  parser.py             Structured data parser
  dspy_cleanup.py       DSPy-based table classification
  llm_client.py         LLM client for structured extraction
  export.py             JSON/CSV export
  schemas.py            Pydantic models
  samples/              Gold-standard samples for DSPy optimization
  optimized/            Optimized DSPy programs
runpod/
  lightonocr_setup.sh   RunPod GPU pod setup script
  LIGHTONOCR_README.md  Deployment guide for LightOnOCR on RunPod
  server.py             Custom DeepSeek-OCR-2 server (alternative model)
  setup.sh              DeepSeek-OCR-2 setup script
```

## Requirements

- Python 3.11+
- A running vLLM server with LightOnOCR-2-1B (see `runpod/LIGHTONOCR_README.md`)

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install flask httpx pypdfium2 pillow pydantic
```

## Usage

```bash
# Point to your vLLM OCR server
python app.py --server-url https://<pod-id>-8000.proxy.runpod.net/v1

# Or with a local server
python app.py --server-url http://localhost:8000/v1
```

Open http://localhost:5001 in your browser.

### Deploy LightOnOCR on RunPod

```bash
ssh root@<ip> -p <port> -i ~/.ssh/id_ed25519
cd /workspace
git clone https://github.com/hollowtensor/caie.git
bash caie/runpod/lightonocr_setup.sh

vllm serve lightonai/LightOnOCR-2-1B \
  --host 0.0.0.0 --port 8000 \
  --limit-mm-per-prompt '{"image": 1}' \
  --mm-processor-cache-gb 0 \
  --no-enable-prefix-caching \
  --gpu-memory-utilization 0.85
```

## How It Works

1. **Upload** — select company, year, month; upload a PDF
2. **Render** — pages are rendered at 200 DPI (max 1540px) and saved as images
3. **OCR** — 8 pages sent concurrently to vLLM as JPEG (quality 90); markdown saved per-page to SQLite
4. **Browse** — click any page thumbnail to view the OCR'd markdown (rendered or raw)

All uploads persist in SQLite (`data/uploads.db`) so results survive page refreshes and server restarts.
