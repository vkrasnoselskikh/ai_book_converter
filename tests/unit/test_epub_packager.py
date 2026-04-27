from __future__ import annotations

import zipfile
from pathlib import Path

from ai_book_converter.job import create_job_paths
from ai_book_converter.models import BookMetadata, PageContent, PageTable, TocEntry
from ai_book_converter.processing import build_endnotes, extract_images, normalize_ocr_response
from ai_book_converter.renderer import (
    publish_output,
    render_book_html,
    render_book_xhtml,
    render_body_sections,
    render_cover_xhtml,
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
    cover_xhtml = render_cover_xhtml(
        BookMetadata(
            title="sample",
            authors=["Test Author"],
            language="ru",
            toc_entries=[TocEntry(title="Chapter 1", page_index=0)],
            cover_subtitle="Subtitle",
        )
    )
    write_book_artifacts(job_paths, html_body, endnotes_html, content_html, content_xhtml, cover_xhtml)
    output_path = publish_output(
        job_paths,
        tmp_path / "sample.epub",
        metadata=BookMetadata(
            title="sample",
            authors=["Test Author"],
            language="ru",
            toc_entries=[TocEntry(title="Chapter 1", page_index=0)],
            cover_subtitle="Subtitle",
        ),
    )
    assert output_path.exists()
    with zipfile.ZipFile(output_path) as epub_archive:
        assert epub_archive.namelist()[0] == "mimetype"
        assert epub_archive.read("mimetype") == b"application/epub+zip"
        assert "META-INF/container.xml" in epub_archive.namelist()
        assert "OEBPS/content.opf" in epub_archive.namelist()
        assert "OEBPS/toc.ncx" in epub_archive.namelist()
        assert "OEBPS/content.xhtml" in epub_archive.namelist()
        assert "OEBPS/cover.xhtml" in epub_archive.namelist()
        cover_xhtml_text = epub_archive.read("OEBPS/cover.xhtml").decode("utf-8")
        assert "cover-title" in cover_xhtml_text
        assert "sample" in cover_xhtml_text
        assert "Test Author" in cover_xhtml_text
        assert "Subtitle" in cover_xhtml_text
        content_opf_text = epub_archive.read("OEBPS/content.opf").decode("utf-8")
        assert "<dc:title>sample</dc:title>" in content_opf_text
        assert "<dc:creator>Test Author</dc:creator>" in content_opf_text
        assert "<dc:language>ru</dc:language>" in content_opf_text
        assert 'id="cover" href="cover.xhtml"' in content_opf_text
        assert 'reference href="cover.xhtml" title="Cover" type="cover"' in content_opf_text
        assert '<itemref idref="cover" linear="yes" />' in content_opf_text
        toc_ncx_text = epub_archive.read("OEBPS/toc.ncx").decode("utf-8")
        assert "Chapter 1" in toc_ncx_text
        assert 'content.xhtml#page-0' in toc_ncx_text
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
