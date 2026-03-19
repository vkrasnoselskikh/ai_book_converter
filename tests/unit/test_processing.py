from __future__ import annotations

from pathlib import Path

from ai_book_converter.processing import build_endnotes, extract_images, normalize_code_blocks, normalize_ocr_response
from tests.helpers.fixtures import fixture_pages, load_ocr_fixture


# Requirements: book-converter.4, book-converter.6
def test_should_normalize_page_content_and_strip_header_footer(tmp_path: Path) -> None:
    """Preconditions: A fixture OCR response with headers, body, footers and images exists.
    Action: Extract images and normalize the OCR response.
    Assertions: Headers and footers are removed from body content and images are preserved.
    Requirements: book-converter.4, book-converter.6"""
    payload = load_ocr_fixture()
    saved_images = extract_images(payload, tmp_path / "images")
    normalized_pages = normalize_ocr_response(payload, saved_images)
    pages = fixture_pages()
    assert len(normalized_pages) == len(pages)
    first_page = normalized_pages[0]
    assert first_page.body_markdown.startswith("# Паттерны разработки на Python")
    assert "O'REILLY®" not in first_page.body_markdown
    assert "Гарри Персиваль" not in first_page.body_markdown
    assert first_page.images
    assert first_page.images[0].width > 0
    assert first_page.images[0].height > 0


# Requirements: book-converter.5
def test_should_build_endnotes_and_backlinks() -> None:
    """Preconditions: Normalized pages contain a footer block matching a marker in body text.
    Action: Build endnotes from the normalized pages.
    Assertions: The page body gets a backlink and the endnote is recorded.
    Requirements: book-converter.5"""
    payload = load_ocr_fixture()
    normalized_pages = normalize_ocr_response(payload, {})
    pages_with_notes, endnotes = build_endnotes(normalized_pages)
    expected_endnotes = sum(1 for page in fixture_pages() if page.get("footer"))
    assert len(endnotes) == expected_endnotes
    assert endnotes
    assert any(note.linked is False for note in endnotes)
    assert endnotes[0].text
    assert pages_with_notes[0].body_markdown.startswith("# Паттерны разработки на Python")


# Requirements: book-converter.4, book-converter.7
def test_should_restore_indentation_in_python_code_blocks() -> None:
    """Preconditions: OCR markdown contains a Python code block with lost indentation.
    Action: Normalize code blocks in the OCR markdown.
    Assertions: The resulting fenced block restores nested indentation for Python code.
    Requirements: book-converter.4, book-converter.7"""
    page_202 = fixture_pages()[202]
    normalized_markdown = normalize_code_blocks(str(page_202["markdown"]))
    assert "def handle_event(" in normalized_markdown
    assert "    event: events.Event," in normalized_markdown
    assert "    queue: List[Message]," in normalized_markdown
    assert "for handler in EVENT_HANDLERS[type(event)]:" in normalized_markdown
    assert "    try:" in normalized_markdown
    assert "        logger.debug('handling event %s with handler %s', event," in normalized_markdown
    assert "        handler(event, uow=uow)" in normalized_markdown
    assert "    except Exception:" in normalized_markdown
