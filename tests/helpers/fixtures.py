from __future__ import annotations

import json
from pathlib import Path

from ai_book_converter.json_types import JsonObject


FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures"
ASSET_ROOT = Path(__file__).resolve().parents[1] / "assets"
OCR_FIXTURE_PATH = FIXTURE_ROOT / "sample_ocr_response.json"
OCR_SOURCE_ASSET_PATH = ASSET_ROOT / "Паттерны разработки на Python - TDD, DDD и событийно-ориентированная архитектура (Гарри Персиваль, Боб Грегори).pdf"


# Requirements: book-converter.1, book-converter.8
def create_dummy_source_document(tmp_path: Path, suffix: str = ".pdf") -> Path:
    source_path = tmp_path / f"sample{suffix}"
    source_path.write_bytes(b"%PDF-1.4\n%dummy content\n")
    return source_path


# Requirements: book-converter.8
def load_ocr_fixture() -> JsonObject:
    payload = json.loads(OCR_FIXTURE_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"OCR fixture must contain a JSON object: {OCR_FIXTURE_PATH}")
    return {str(key): value for key, value in payload.items()}


# Requirements: book-converter.8
def fixture_pages() -> list[JsonObject]:
    pages = load_ocr_fixture().get("pages")
    if not isinstance(pages, list):
        return []
    return [page for page in pages if isinstance(page, dict)]
