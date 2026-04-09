"""
backend/main.py
---------------
FastAPI server that exposes the PDF scraper as a REST endpoint.
The React Native frontend POSTs a file here and gets structured JSON back.

Run:
    pip install fastapi uvicorn python-multipart pdfplumber
    uvicorn main:app --reload --port 8000
"""

import json
import sys
from pathlib import Path
from io import BytesIO

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# Pull in the shared scraper utils
sys.path.insert(0, str(Path(__file__).parent.parent / "Pdf_scrapper" / "Scrapper"))
from utils.text_extraction import extract_text, extract_text_with_ocr  # noqa: E402

import pdfplumber  # noqa: E402

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="PDF Scraper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this in production
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    mode: str = Form("auto"),      # auto | doc | slides
    use_ocr: str = Form("false"),  # accept as string, parse manually
):
    pdf_bytes = await file.read()
    ocr_enabled = use_ocr.lower() == "true"

    # Resolve full page list
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        pages = list(range(1, len(pdf.pages) + 1))

    page_results = extract_text(BytesIO(pdf_bytes), pages, mode)

    # OCR fallback for empty pages
    if ocr_enabled:
        empty_pages = [r["page"] for r in page_results if not r["text"].strip()]
        if empty_pages:
            ocr_results = extract_text_with_ocr(pdf_bytes, empty_pages)
            ocr_by_page = {r["page"]: r for r in ocr_results}
            page_results = [
                ocr_by_page[r["page"]] if not r["text"].strip() and r["page"] in ocr_by_page else r
                for r in page_results
            ]

    result = {
        "source":      file.filename,
        "mode":        mode,
        "total_pages": len(pages),
        "pages":       page_results,
    }

    # Save to local output folder
    stem = Path(file.filename).stem
    out_path = OUTPUT_DIR / f"{stem}.json"
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  Saved: {out_path}")

    return result
