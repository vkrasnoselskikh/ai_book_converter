from __future__ import annotations

import pytest

from ai_book_converter.errors import OcrProcessingError
from ai_book_converter.ocr import merge_hybrid_ocr_payloads, parse_llm_ocr_payload


# Requirements: book-converter.3
def test_should_replace_first_pages_with_llm_payload_and_preserve_images() -> None:
    """Preconditions: OCR pages contain images and LLM pages cover the beginning of the document.
    Action: Merge the OCR payload with the LLM payload for the first twenty pages.
    Assertions: Front pages use LLM markdown while OCR images are preserved and later pages stay unchanged.
    Requirements: book-converter.3"""
    ocr_response = {
        "pages": [
            {
                "index": 0,
                "markdown": "ocr page 0",
                "headers": ["Header 0"],
                "footers": ["Footer 0"],
                "images": [{"id": "cover-image"}],
            },
            {
                "index": 1,
                "markdown": "ocr page 1",
                "headers": ["Header 1"],
                "footers": ["Footer 1"],
                "images": [],
            },
            {
                "index": 20,
                "markdown": "ocr page 20",
                "headers": [],
                "footers": [],
                "images": [],
            },
        ]
    }
    llm_response = {
        "pages": [
            {
                "index": 0,
                "markdown": "llm page 0",
                "headers": [],
                "footers": [],
                "images": [],
            },
            {
                "index": 1,
                "markdown": "llm page 1",
                "headers": [],
                "footers": [],
                "images": [],
            },
        ]
    }

    merged = merge_hybrid_ocr_payloads(ocr_response=ocr_response, llm_response=llm_response, llm_page_count=20)
    pages = merged["pages"]

    assert isinstance(pages, list)
    assert pages[0]["markdown"] == "llm page 0"
    assert pages[0]["images"] == [{"id": "cover-image"}]
    assert pages[1]["markdown"] == "llm page 1"
    assert pages[2]["markdown"] == "ocr page 20"


# Requirements: book-converter.3
def test_should_shift_one_based_llm_page_indexes_to_zero_based() -> None:
    """Preconditions: LLM returns one-based indexes for the front pages.
    Action: Merge OCR and LLM payloads.
    Assertions: The first OCR page is replaced even when LLM indexes start from one.
    Requirements: book-converter.3"""
    ocr_response = {
        "pages": [
            {"index": 0, "markdown": "ocr page 0", "headers": [], "footers": [], "images": []},
            {"index": 1, "markdown": "ocr page 1", "headers": [], "footers": [], "images": []},
        ]
    }
    llm_response = {
        "pages": [
            {"index": 1, "markdown": "llm page 0", "headers": [], "footers": [], "images": []},
            {"index": 2, "markdown": "llm page 1", "headers": [], "footers": [], "images": []},
        ]
    }

    merged = merge_hybrid_ocr_payloads(ocr_response=ocr_response, llm_response=llm_response, llm_page_count=20)
    pages = merged["pages"]

    assert isinstance(pages, list)
    assert pages[0]["markdown"] == "llm page 0"
    assert pages[1]["markdown"] == "llm page 1"


# Requirements: book-converter.3
def test_should_parse_json_code_fences_from_llm_response() -> None:
    """Preconditions: LLM returns JSON wrapped in markdown fences.
    Action: Parse the LLM OCR payload.
    Assertions: The payload is loaded as a JSON object with a pages list.
    Requirements: book-converter.3"""
    payload = parse_llm_ocr_payload(
        """```json
{"pages":[{"index":0,"markdown":"hello","headers":[],"footers":[],"images":[]}]}
```"""
    )

    assert list(payload) == ["pages"]
    assert payload["pages"] == [{"index": 0, "markdown": "hello", "headers": [], "footers": [], "images": []}]


# Requirements: book-converter.3
def test_should_raise_clear_error_for_invalid_llm_json_payload() -> None:
    """Preconditions: LLM returns malformed JSON content.
    Action: Parse the LLM OCR payload.
    Assertions: The parser raises an OCR processing error with a clear JSON validation message.
    Requirements: book-converter.3"""
    with pytest.raises(OcrProcessingError, match="LLM OCR payload is not valid JSON"):
        parse_llm_ocr_payload('{"pages": [{"index": 0, "markdown": "unterminated}]')
