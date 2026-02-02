from __future__ import annotations

from pydantic import BaseModel


class PricelistItem(BaseModel):
    page: int
    category: str
    subcategory: str
    frame: str | None = None
    description: str | None = None
    reference: str
    specifications: dict
    prices: dict
    unit: str = "INR"


class PageResult(BaseModel):
    page: int
    status: str  # "success", "no_table", "error"
    raw_markdown: str
    items: list[PricelistItem] = []
    error: str | None = None


class ExtractionResult(BaseModel):
    source_file: str
    effective_date: str
    company: str = "Schneider Electric"
    total_pages: int
    pages_processed: int
    items: list[PricelistItem] = []
    errors: list[dict] = []


class JobStatus(BaseModel):
    job_id: str
    state: str = "pending"  # pending, rendering, parsing, done, error
    current_page: int = 0
    total_pages: int = 0
    message: str = ""
    items_found: int = 0
