from __future__ import annotations

import json
import os

import dspy
from dspy.teleprompt import BootstrapFewShot


# ── DSPy Signature ───────────────────────────────────────────────────────


class TableClassify(dspy.Signature):
    """Classify columns of a product pricelist table and identify the product category/subcategory."""

    context: str = dspy.InputField(
        desc="Section heading / text before the table"
    )
    headers: str = dspy.InputField(desc="Pipe-separated column headers")
    sample_rows: str = dspy.InputField(
        desc="First 2 data rows formatted as 'header: value' pairs"
    )

    category: str = dspy.OutputField(desc="Product family/section name")
    subcategory: str = dspy.OutputField(desc="Specific product group")
    column_roles: str = dspy.OutputField(
        desc=(
            "JSON object mapping each header to a role: "
            "reference, price, spec, frame, description, or skip"
        )
    )


# ── DSPy Module ──────────────────────────────────────────────────────────


class TableClassifier(dspy.Module):
    def __init__(self):
        self.classify = dspy.ChainOfThought(TableClassify)

    def forward(self, context, headers, sample_rows):
        return self.classify(
            context=context, headers=headers, sample_rows=sample_rows
        )


# ── Metric ───────────────────────────────────────────────────────────────


def classification_metric(example, prediction, trace=None):
    """Score a prediction against a gold example. Returns 0.0-1.0."""
    score = 0.0

    # Category match (fuzzy substring)
    if (
        example.category.lower() in prediction.category.lower()
        or prediction.category.lower() in example.category.lower()
    ):
        score += 0.2

    # Subcategory match (fuzzy substring)
    if (
        example.subcategory.lower() in prediction.subcategory.lower()
        or prediction.subcategory.lower() in example.subcategory.lower()
    ):
        score += 0.2

    # Column roles (exact per-column match — the critical part)
    try:
        gold_roles = json.loads(example.column_roles)
        pred_roles = json.loads(prediction.column_roles)
        total = len(gold_roles)
        if total > 0:
            matches = sum(
                1
                for h in gold_roles
                if gold_roles.get(h) == pred_roles.get(h)
            )
            score += 0.6 * (matches / total)
    except (json.JSONDecodeError, AttributeError):
        pass

    return score


# ── Helpers ──────────────────────────────────────────────────────────────


def _format_sample_rows(
    headers: list[str], sample_rows: list[dict[str, str]]
) -> str:
    """Format sample rows as readable text for the DSPy input."""
    lines = []
    for i, row in enumerate(sample_rows[:2]):
        cells = [f"{h}: {row.get(h, '')}" for h in headers]
        lines.append(f"Row {i + 1}: {' | '.join(cells)}")
    return "\n".join(lines)


def _load_examples(samples_path: str) -> list[dict]:
    """Load gold examples from a JSON file."""
    with open(samples_path) as f:
        return json.load(f)


# ── LM Configuration ────────────────────────────────────────────────────


def configure_lm(
    llm_url: str = "http://localhost:1234/v1",
    model: str = "qwen/qwen3-4b-2507",
):
    """Configure the DSPy language model."""
    lm = dspy.LM(
        f"openai/{model}",
        api_key="not-needed",
        api_base=llm_url,
    )
    dspy.configure(lm=lm)


# ── Optimize ─────────────────────────────────────────────────────────────


def optimize(
    samples_path: str,
    output_path: str,
    llm_url: str = "http://localhost:1234/v1",
    model: str = "qwen/qwen3-4b-2507",
) -> TableClassifier:
    """Load gold examples, run BootstrapFewShot, save optimized program."""
    configure_lm(llm_url, model)

    examples = _load_examples(samples_path)
    trainset = [
        dspy.Example(
            context=ex["context"],
            headers=ex["headers"],
            sample_rows=ex["sample_rows"],
            category=ex["category"],
            subcategory=ex["subcategory"],
            column_roles=ex["column_roles"],
        ).with_inputs("context", "headers", "sample_rows")
        for ex in examples
    ]

    optimizer = BootstrapFewShot(
        metric=classification_metric,
        max_bootstrapped_demos=4,
        max_labeled_demos=4,
    )
    program = TableClassifier()
    optimized = optimizer.compile(program, trainset=trainset)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    optimized.save(output_path)
    return optimized


# ── Load & Use ───────────────────────────────────────────────────────────


def load_optimized(
    path: str,
    llm_url: str = "http://localhost:1234/v1",
    model: str = "qwen/qwen3-4b-2507",
) -> TableClassifier:
    """Load a saved optimized program."""
    configure_lm(llm_url, model)
    program = TableClassifier()
    program.load(path=path)
    return program


def classify_table(
    program: TableClassifier,
    headers: list[str],
    sample_rows: list[dict[str, str]],
    context: str,
) -> dict | None:
    """Run classification using the DSPy program.

    Returns dict with "category", "subcategory", "columns" or None on failure.
    """
    headers_str = " | ".join(headers)
    rows_str = _format_sample_rows(headers, sample_rows)

    try:
        result = program(
            context=context, headers=headers_str, sample_rows=rows_str
        )
        return {
            "category": result.category,
            "subcategory": result.subcategory,
            "columns": json.loads(result.column_roles),
        }
    except Exception:
        return None
