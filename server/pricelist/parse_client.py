from __future__ import annotations

import base64
from io import BytesIO

import httpx
import pypdfium2 as pdfium
from PIL import Image

MODEL_ID = "lightonai/LightOnOCR-2-1B"
API_KEY = "not-needed"

PDF_SCALE = 2.77  # 200 / 72 DPI
MAX_RESOLUTION = 1540


def render_pdf_page(page, max_res: int = MAX_RESOLUTION, scale: float = PDF_SCALE) -> Image.Image:
    w, h = page.get_size()
    pw, ph = w * scale, h * scale
    factor = min(1, max_res / pw, max_res / ph)
    return page.render(scale=scale * factor, rev_byteorder=True).to_pil()


def render_pdf_pages(pdf_path: str) -> list[Image.Image]:
    pdf = pdfium.PdfDocument(pdf_path)
    images = [render_pdf_page(pdf[i]) for i in range(len(pdf))]
    pdf.close()
    return images


def _clean_output(text: str) -> str:
    if not text:
        return ""
    markers = ["system", "user", "assistant"]
    lines = text.split("\n")
    cleaned = [l for l in lines if l.strip().lower() not in markers]
    result = "\n".join(cleaned).strip()
    if "assistant" in text.lower():
        parts = text.split("assistant", 1)
        if len(parts) > 1:
            result = parts[1].strip()
    return result


def parse_page(image: Image.Image, server_url: str, max_tokens: int = 4096) -> str:
    buf = BytesIO()
    image.save(buf, format="JPEG", quality=90)
    image_b64 = base64.b64encode(buf.getvalue()).decode()
    image_uri = f"data:image/jpeg;base64,{image_b64}"

    payload = {
        "model": MODEL_ID,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_uri}},
                ],
            }
        ],
        "max_tokens": max_tokens,
        "temperature": 0.0,
        "top_p": 0.9,
        "stream": False,
    }

    headers = {"Authorization": f"Bearer {API_KEY}"}
    resp = httpx.post(
        f"{server_url}/chat/completions",
        json=payload,
        headers=headers,
        timeout=300.0,
    )
    resp.raise_for_status()
    text = resp.json()["choices"][0]["message"]["content"]
    return _clean_output(text)
