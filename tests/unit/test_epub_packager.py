from __future__ import annotations

import zipfile
from pathlib import Path

from ai_book_converter.job import create_job_paths
from ai_book_converter.models import PageContent, PageTable
from ai_book_converter.processing import build_endnotes, extract_images, normalize_ocr_response
from ai_book_converter.renderer import (
    publish_output,
    render_book_html,
    render_book_xhtml,
    render_body_sections,
    render_endnotes_html,
    write_book_artifacts,
)
from tests.helpers.fixtures import load_ocr_fixture


# Requirements: book-converter.7
def test_should_embed_table_html_in_rendered_sections() -> None:
    """Preconditions: A normalized page contains a markdown link placeholder for an OCR table.
    Action: Render body sections for the page.
    Assertions: The rendered HTML contains the embedded table instead of a dead tbl-*.html link.
    Requirements: book-converter.7"""
    pages = [
        PageContent(
            page_index=0,
            header_blocks=[],
            body_markdown="Before table\n\n[tbl-0.html](tbl-0.html)\n\nAfter table",
            footer_blocks=[],
            images=[],
            tables=[
                PageTable(
                    table_id="tbl-0.html",
                    content_html="<table><tr><td>Embedded cell</td></tr></table>",
                    page_index=0,
                )
            ],
        )
    ]

    rendered_html = render_body_sections(pages, image_href_prefix="images")

    assert "tbl-0.html" not in rendered_html
    assert "<table>" in rendered_html
    assert "Embedded cell" in rendered_html
    assert "<p>After table</p>" in rendered_html


# Requirements: book-converter.7
def test_should_build_epub_archive_with_required_files(tmp_path: Path) -> None:
    """Preconditions: Normalized pages and extracted images are available from a fixture OCR response.
    Action: Render book artifacts and publish them as EPUB.
    Assertions: The EPUB archive contains the required package files and packaged images.
    Requirements: book-converter.7"""
    payload = load_ocr_fixture()
    job_paths, _ = create_job_paths(tmp_path / "job")
    saved_images = extract_images(payload, job_paths.images_dir)
    normalized_pages = normalize_ocr_response(payload, saved_images)
    pages_with_notes, endnotes = build_endnotes(normalized_pages)
    html_body = render_body_sections(pages_with_notes, image_href_prefix="../images")
    epub_body = render_body_sections(pages_with_notes, image_href_prefix="images")
    endnotes_html = render_endnotes_html(endnotes)
    content_html = render_book_html(html_body, endnotes_html)
    content_xhtml = render_book_xhtml("sample", epub_body, endnotes_html)
    write_book_artifacts(job_paths, html_body, endnotes_html, content_html, content_xhtml)
    output_path = publish_output(job_paths, tmp_path / "sample.epub", title="sample")
    assert output_path.exists()
    with zipfile.ZipFile(output_path) as epub_archive:
        assert epub_archive.namelist()[0] == "mimetype"
        assert epub_archive.read("mimetype") == b"application/epub+zip"
        assert "META-INF/container.xml" in epub_archive.namelist()
        assert "OEBPS/content.opf" in epub_archive.namelist()
        assert "OEBPS/toc.ncx" in epub_archive.namelist()
        assert "OEBPS/content.xhtml" in epub_archive.namelist()
        content_xhtml_text = epub_archive.read("OEBPS/content.xhtml").decode("utf-8")
        assert "<section" in content_xhtml_text
        assert "<h1>" in content_xhtml_text
        assert '<img ' in content_xhtml_text
        assert 'src="images/' in content_xhtml_text
        assert "tbl-0.html" not in content_xhtml_text
        assert "tbl-1.html" not in content_xhtml_text
        assert "<table>" in content_xhtml_text
        image_files = [name for name in epub_archive.namelist() if name.startswith("OEBPS/images/")]
        assert image_files
        for image_path in image_files:
            image_name = image_path.removeprefix("OEBPS/")
            assert image_name in content_xhtml_text
