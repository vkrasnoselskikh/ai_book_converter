from __future__ import annotations

import logging
import os
from pathlib import Path


logger = logging.getLogger(__name__)

DEFAULT_OCR_MODEL = "mistral-ocr-latest"
DEFAULT_LLM_MODEL = "mistral-small-latest"
HYBRID_LLM_PAGE_COUNT = 20
FRONT_MATTER_PAGE_COUNT = 4
JOB_DIR_PREFIX = "ai_book_converter_"
SUPPORTED_EXTENSIONS = {".pdf", ".djvu"}


# Requirements: book-converter.1, book-converter.3
def load_mistral_api_key() -> str | None:
    return os.getenv("MISTRAL_API_KEY")


# Requirements: book-converter.1, book-converter.7
def default_output_path(source_path: Path, output_path: Path | None) -> Path:
    if output_path is not None:
        return output_path
    return Path.cwd() / f"{source_path.stem}.epub"
