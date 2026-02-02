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

# Set at startup via CLI args
SERVER_URL: str = ""
