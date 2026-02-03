from __future__ import annotations

import os
from dotenv import load_dotenv

# Load .env before reading any env vars
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
PDF_DIR = os.path.join(DATA_DIR, "pdfs")
PAGES_DIR = os.path.join(DATA_DIR, "pages")
OUTPUT_DIR = os.path.join(DATA_DIR, "output")

for d in (DATA_DIR, PDF_DIR, PAGES_DIR, OUTPUT_DIR):
    os.makedirs(d, exist_ok=True)

# Loaded from env (.env via dotenv), overridable via CLI --server-url
SERVER_URL: str = os.environ.get("LIGHTONOCR_SERVER_URL", "http://localhost:8000/v1")

# VLM for table validation (LM Studio / RunPod)
VLM_SERVER_URL: str = os.environ.get("VLM_SERVER_URL", "http://localhost:1234/v1")
VLM_MODEL: str = os.environ.get("VLM_MODEL", "qwen/qwen3-vl-8b")

# LLM for table correction (text-only, uses markdown context)
LLM_SERVER_URL: str = os.environ.get("LLM_SERVER_URL", "http://localhost:1234/v1")
LLM_MODEL: str = os.environ.get("LLM_MODEL", "gpt-oss-20b")

# PostgreSQL
DATABASE_URL: str = os.environ.get(
    "DATABASE_URL", "postgresql://caie:caie_dev@localhost:5432/caie"
)

# Redis
REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# JWT
JWT_SECRET_KEY: str = os.environ.get("JWT_SECRET_KEY", "change-me-in-production")
JWT_ACCESS_TOKEN_EXPIRES: int = int(
    os.environ.get("JWT_ACCESS_TOKEN_EXPIRES", "900")
)
JWT_REFRESH_TOKEN_EXPIRES: int = int(
    os.environ.get("JWT_REFRESH_TOKEN_EXPIRES", "2592000")
)

# Minio (S3-compatible object storage)
MINIO_ENDPOINT: str = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY: str = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY: str = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
MINIO_SECURE: bool = os.environ.get("MINIO_SECURE", "false").lower() == "true"
MINIO_BUCKET_PDFS: str = os.environ.get("MINIO_BUCKET_PDFS", "caie-pdfs")
MINIO_BUCKET_PAGES: str = os.environ.get("MINIO_BUCKET_PAGES", "caie-pages")
MINIO_BUCKET_OUTPUT: str = os.environ.get("MINIO_BUCKET_OUTPUT", "caie-output")
