from __future__ import annotations

import csv
import json
import os
from io import StringIO

from .schemas import ExtractionResult


def to_json(result: ExtractionResult) -> str:
    return result.model_dump_json(indent=2)


def to_csv(result: ExtractionResult) -> str:
    if not result.items:
        return ""

    # collect all spec and price keys across items
    spec_keys: set[str] = set()
    price_keys: set[str] = set()
    for item in result.items:
        spec_keys.update(item.specifications.keys())
        price_keys.update(item.prices.keys())

    spec_keys_sorted = sorted(spec_keys)
    price_keys_sorted = sorted(price_keys)

    fixed_cols = [
        "page",
        "category",
        "subcategory",
        "frame",
        "reference",
        "description",
        "unit",
    ]
    header = (
        fixed_cols
        + [f"spec_{k}" for k in spec_keys_sorted]
        + [f"price_{k}" for k in price_keys_sorted]
    )

    buf = StringIO()
    writer = csv.DictWriter(buf, fieldnames=header)
    writer.writeheader()

    for item in result.items:
        row: dict[str, str] = {
            "page": str(item.page),
            "category": item.category,
            "subcategory": item.subcategory,
            "frame": item.frame or "",
            "reference": item.reference,
            "description": item.description or "",
            "unit": item.unit,
        }
        for k in spec_keys_sorted:
            row[f"spec_{k}"] = str(item.specifications.get(k, ""))
        for k in price_keys_sorted:
            val = item.prices.get(k)
            row[f"price_{k}"] = str(val) if val is not None else ""

        writer.writerow(row)

    return buf.getvalue()


def save_results(
    result: ExtractionResult, output_dir: str
) -> tuple[str, str]:
    os.makedirs(output_dir, exist_ok=True)

    json_path = os.path.join(output_dir, "extraction.json")
    csv_path = os.path.join(output_dir, "extraction.csv")

    with open(json_path, "w") as f:
        f.write(to_json(result))

    csv_content = to_csv(result)
    with open(csv_path, "w") as f:
        f.write(csv_content)

    return json_path, csv_path
