from __future__ import annotations

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
PDF_DIR = os.path.join(DATA_DIR, "pdfs")
PAGES_DIR = os.path.join(DATA_DIR, "pages")
OUTPUT_DIR = os.path.join(DATA_DIR, "output")
DB_PATH = os.path.join(DATA_DIR, "uploads.db")

for d in (DATA_DIR, PDF_DIR, PAGES_DIR, OUTPUT_DIR):
    os.makedirs(d, exist_ok=True)

# Loaded from env (.env via dotenv), overridable via CLI --server-url
SERVER_URL: str = os.environ.get("LIGHTONOCR_SERVER_URL", "http://localhost:8000/v1")

# VLM for table validation (LM Studio / RunPod)
VLM_SERVER_URL: str = os.environ.get("VLM_SERVER_URL", "http://localhost:1234/v1")
VLM_MODEL: str = os.environ.get("VLM_MODEL", "qwen/qwen3-vl-8b")
