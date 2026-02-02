from __future__ import annotations

import os
from typing import Callable

from .dspy_cleanup import (
    TableClassifier,
    configure_lm,
    load_optimized,
)
from .export import save_results
from .parse_client import parse_page as vision_parse, render_pdf_pages
from .parser import parse_page
from .schemas import ExtractionResult, PricelistItem

# Path to the optimized programs directory (relative to this file)
_OPTIMIZED_DIR = os.path.join(os.path.dirname(__file__), "optimized")


def _load_program(
    company: str,
    llm_url: str,
    llm_model: str,
) -> TableClassifier:
    """Load the optimized DSPy program for a company, or fall back to unoptimized."""
    optimized_path = os.path.join(_OPTIMIZED_DIR, f"{company}.json")

    if os.path.exists(optimized_path):
        return load_optimized(optimized_path, llm_url, llm_model)

    # No optimized program — configure LM and return a fresh (unoptimized) module
    configure_lm(llm_url, llm_model)
    return TableClassifier()


def run_extraction(
    pdf_path: str,
    server_url: str,
    output_dir: str,
    llm_url: str = "http://localhost:1234/v1",
    llm_model: str = "",
    company: str = "schneider",
    on_progress: Callable[[str, int, int, int, str], None] | None = None,
) -> ExtractionResult:
    """Run the full extraction pipeline.

    Args:
        pdf_path: Path to PDF file.
        server_url: vLLM server base URL (with /v1).
        output_dir: Directory to write JSON/CSV output files.
        llm_url: LLM server base URL for structured extraction.
        llm_model: LLM model name (auto-detected if empty).
        company: Company slug — used to load optimized DSPy program.
        on_progress: Optional callback(state, current_page, total_pages, items_found, message).

    Returns:
        ExtractionResult with all extracted items.
    """

    def progress(state: str, page: int, total: int, items: int, msg: str):
        if on_progress:
            on_progress(state, page, total, items, msg)

    # Stage 0: Load DSPy program
    progress("loading", 0, 0, 0, "Loading classification model...")
    program = _load_program(company, llm_url, llm_model)

    # Stage 1: Render PDF pages
    progress("rendering", 0, 0, 0, "Rendering PDF pages...")
    images = render_pdf_pages(pdf_path)
    total_pages = len(images)
    progress("rendering", 0, total_pages, 0, f"Rendered {total_pages} pages")

    # Stage 2: Parse + Stage 3: DSPy extraction
    all_items: list[PricelistItem] = []
    errors: list[dict] = []
    pages_processed = 0

    for i, image in enumerate(images):
        page_num = i + 1
        progress("parsing", page_num, total_pages, len(all_items), f"Parsing page {page_num}/{total_pages}")

        try:
            markdown = vision_parse(image, server_url)
        except Exception as e:
            errors.append({"page": page_num, "stage": "parsing", "error": str(e)})
            progress("parsing", page_num, total_pages, len(all_items), f"Parse failed page {page_num}: {e}")
            continue

        pages_processed += 1

        progress("extracting", page_num, total_pages, len(all_items), f"Classifying page {page_num}")

        try:
            page_items = parse_page(page_num, markdown, program)
            all_items.extend(page_items)
        except Exception as e:
            errors.append({"page": page_num, "stage": "extracting", "error": str(e)})

        progress("extracting", page_num, total_pages, len(all_items), f"Page {page_num}: {len(page_items)} items")

    # Stage 4: Build result
    result = ExtractionResult(
        source_file=os.path.basename(pdf_path),
        effective_date="",  # could be extracted from cover page
        company=company.replace("-", " ").title(),
        total_pages=total_pages,
        pages_processed=pages_processed,
        items=all_items,
        errors=errors,
    )

    # Stage 5: Save outputs
    progress("done", total_pages, total_pages, len(all_items), "Saving results...")
    save_results(result, output_dir)
    progress("done", total_pages, total_pages, len(all_items), f"Done. {len(all_items)} items extracted.")

    return result
