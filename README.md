# CAIE — Context-Aware Information Extraction

Extract structured data from PDF pricelists using OCR and LLMs.

Upload a PDF, OCR every page via [LightOnOCR-2](https://huggingface.co/lightonai/LightOnOCR-2-1B) running on vLLM, browse rendered pages, and view the extracted markdown.

## Architecture

```
React (Vite + Tailwind)         Flask API
  :5173  ──proxy──►  :5001
    │                   │
    │    /api/uploads   ├── SQLite (uploads + pages)
    │    /upload        ├── PDF storage (data/pdfs/)
    │    /pages/...     ├── Page images (data/pages/)
    │                   │
    │                   └── OCR workers (8 concurrent)
    │                            │
    │                            ▼
    │                      vLLM server
    │                   (LightOnOCR-2-1B)
    │                     on RunPod GPU
```

## Project Structure

```
server/
  app.py              Flask app factory + main()
  config.py           Paths, directories, server URL
  db.py               SQLite helpers (uploads + pages tables)
  routes/
    uploads.py        /api/uploads CRUD, /upload, SSE status
    pages.py          Page images, page states, markdown
  tasks/
    ocr.py            Background OCR job (render + concurrent OCR)
  pricelist/
    ocr_client.py     PDF rendering (pypdfium2) + OCR API client
    pipeline.py       Full extraction pipeline (OCR + LLM parsing)
    parser.py         Structured data parser
    dspy_cleanup.py   DSPy-based table classification
    llm_client.py     LLM client for structured extraction
    export.py         JSON/CSV export
    schemas.py        Pydantic models
    samples/          Gold-standard samples
    optimized/        Optimized DSPy programs
client/
  src/
    App.tsx           Main app component
    api.ts            Typed API client
    types.ts          TypeScript interfaces
    components/
      Layout.tsx      Two-panel shell
      UploadForm.tsx  Upload form (company, year, month, file)
      UploadList.tsx  Past uploads with badges + delete
      PageGrid.tsx    Page thumbnails with OCR state
      ProgressCard.tsx Progress bar + stats
      MarkdownViewer.tsx Rendered/Raw markdown toggle
    hooks/
      useSSE.ts       EventSource hook for live progress
      useUploads.ts   Upload list fetcher
runpod/
  lightonocr_setup.sh RunPod setup script
  LIGHTONOCR_README.md Deployment guide
```

## Requirements

- Python 3.11+
- Node.js 18+
- A running vLLM server with LightOnOCR-2-1B (see `runpod/LIGHTONOCR_README.md`)

## Setup

### Server

```bash
uv venv .venv
source .venv/bin/activate
uv pip install flask flask-cors httpx pypdfium2 pillow pydantic
```

### Client

```bash
cd client
npm install
```

## Development

Start both in separate terminals:

```bash
# Terminal 1 — Flask API
python -m server.app --server-url https://<pod-id>-8000.proxy.runpod.net/v1

# Terminal 2 — Vite dev server
cd client && npm run dev
```

Open http://localhost:5173 in your browser. The Vite dev server proxies API requests to Flask on port 5001.

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
2. **Render** — pages rendered at 200 DPI (max 1540px), saved as PNG
3. **OCR** — 8 pages sent concurrently to vLLM as JPEG (quality 90); markdown saved per-page to SQLite
4. **Browse** — click any page thumbnail to view OCR'd markdown (rendered or raw)

All uploads persist in SQLite (`data/uploads.db`) across page refreshes and server restarts.
