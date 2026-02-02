from __future__ import annotations

import httpx


def detect_model(llm_url: str) -> str:
    """Auto-detect the first available model from the LLM server."""
    try:
        resp = httpx.get(f"{llm_url}/models", timeout=10.0)
        resp.raise_for_status()
        models = resp.json().get("data", [])
        if models:
            return models[0]["id"]
    except Exception:
        pass
    return ""
