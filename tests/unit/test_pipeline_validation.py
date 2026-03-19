from __future__ import annotations

from pathlib import Path

import pytest

from ai_book_converter.errors import InputValidationError
from ai_book_converter.ocr import FixtureOcrClient
from ai_book_converter.pipeline import BookPipeline
from tests.helpers.fixtures import OCR_FIXTURE_PATH, create_dummy_source_document


# Requirements: book-converter.1, book-converter.8
def test_should_reject_missing_source_file(tmp_path: Path) -> None:
    """Preconditions: A missing PDF path is provided.
    Action: Construct the pipeline and run it.
    Assertions: The pipeline raises InputValidationError.
    Requirements: book-converter.1"""
    source_path = tmp_path / "missing.pdf"
    pipeline = BookPipeline(source_path=source_path, ocr_client=FixtureOcrClient(OCR_FIXTURE_PATH))
    with pytest.raises(InputValidationError):
        pipeline.handle()


# Requirements: book-converter.1, book-converter.8
def test_should_reject_unsupported_source_extension(tmp_path: Path) -> None:
    """Preconditions: A source file with an unsupported extension exists.
    Action: Construct the pipeline and run it.
    Assertions: The pipeline raises InputValidationError.
    Requirements: book-converter.1"""
    source_path = tmp_path / "sample.txt"
    source_path.write_text("dummy", encoding="utf-8")
    pipeline = BookPipeline(source_path=source_path, ocr_client=FixtureOcrClient(OCR_FIXTURE_PATH))
    with pytest.raises(InputValidationError):
        pipeline.handle()


# Requirements: book-converter.1, book-converter.8
def test_should_accept_djvu_source_extension(tmp_path: Path) -> None:
    """Preconditions: A dummy DJVU file exists and a fixture OCR client is available.
    Action: Run the pipeline with HTML output.
    Assertions: The pipeline completes and produces an HTML file.
    Requirements: book-converter.1, book-converter.8"""
    source_path = create_dummy_source_document(tmp_path, suffix=".djvu")
    output_path = tmp_path / "book.html"
    pipeline = BookPipeline(
        source_path=source_path,
        ocr_client=FixtureOcrClient(OCR_FIXTURE_PATH),
        output_path=output_path,
        keep_temp=True,
    )
    result_path = pipeline.handle()
    assert result_path == output_path
    assert output_path.exists()
