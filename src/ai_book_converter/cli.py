from __future__ import annotations

import argparse
import logging
from pathlib import Path

from dotenv import load_dotenv

from ai_book_converter.config import DEFAULT_OCR_MODEL, load_mistral_api_key
from ai_book_converter.errors import BookConverterError, OcrProcessingError
from ai_book_converter.ocr import HybridMistralOcrClient, OcrClient
from ai_book_converter.pipeline import BookPipeline


logger = logging.getLogger(__name__)


# Requirements: book-converter.1, book-converter.3, book-converter.8
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert OCR source books into Kindle-friendly output.")
    parser.add_argument("source_path", type=Path, help="Path to the source PDF or DJVU file.")
    parser.add_argument("--job-dir", type=Path, help="Reuse or place intermediate OCR artifacts in this directory.")
    parser.add_argument("--output", type=Path, help="Write the final output to this path.")
    parser.add_argument("--model", type=str, default=DEFAULT_OCR_MODEL, help="Mistral OCR model name.")
    parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="Keep auto-created temporary job directories after a successful run.",
    )
    return parser


# Requirements: book-converter.1, book-converter.3
def build_ocr_client() -> OcrClient:
    api_key = load_mistral_api_key()
    if not api_key:
        raise OcrProcessingError("MISTRAL_API_KEY is required for live OCR runs.")
    return HybridMistralOcrClient(api_key)


# Requirements: book-converter.1, book-converter.2, book-converter.3, book-converter.7
def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO)
    load_dotenv()
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        ocr_client = build_ocr_client()
        pipeline = BookPipeline(
            source_path=args.source_path,
            ocr_client=ocr_client,
            model=args.model,
            job_dir=args.job_dir,
            output_path=args.output,
            keep_temp=args.keep_temp,
        )
        output_path = pipeline.handle()
    except BookConverterError as error:
        parser.exit(status=1, message=f"{error}\n")
    print(output_path)
    return 0
