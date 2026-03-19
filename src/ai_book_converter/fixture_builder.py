from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from dotenv import load_dotenv

from ai_book_converter.config import DEFAULT_OCR_MODEL, load_mistral_api_key
from ai_book_converter.errors import OcrProcessingError
from ai_book_converter.ocr import LiveMistralOcrClient


logger = logging.getLogger(__name__)


# Requirements: book-converter.3, book-converter.8
def build_fixture(source_path: Path, fixture_path: Path, model: str) -> Path:
    api_key = load_mistral_api_key()
    if not api_key:
        raise OcrProcessingError("MISTRAL_API_KEY is required to build a live OCR fixture.")
    fixture_path.parent.mkdir(parents=True, exist_ok=True)
    client = LiveMistralOcrClient(api_key)
    payload = client.process_document(source_path=source_path, model=model)
    fixture_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Saved OCR fixture to %s", fixture_path)
    return fixture_path


# Requirements: book-converter.8
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build a live OCR JSON fixture for tests.")
    parser.add_argument("source_path", type=Path, help="Path to the source PDF or DJVU file.")
    parser.add_argument("fixture_path", type=Path, help="Destination path for the OCR JSON fixture.")
    parser.add_argument("--model", type=str, default=DEFAULT_OCR_MODEL, help="Mistral OCR model name.")
    return parser


# Requirements: book-converter.8
def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO)
    load_dotenv()
    parser = build_parser()
    args = parser.parse_args(argv)
    build_fixture(source_path=args.source_path, fixture_path=args.fixture_path, model=args.model)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
