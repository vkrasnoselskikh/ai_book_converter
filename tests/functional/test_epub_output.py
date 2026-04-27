from __future__ import annotations

import zipfile
from pathlib import Path

from ai_book_converter.ocr import FixtureOcrClient
from ai_book_converter.pipeline import BookPipeline
from tests.helpers.fixtures import OCR_FIXTURE_PATH, create_dummy_source_document, fixture_pages


# Requirements: book-converter.2, book-converter.4, book-converter.5, book-converter.6, book-converter.7, book-converter.8
def test_should_process_fixture_and_write_epub_output(tmp_path: Path) -> None:
    """Preconditions: A dummy source book and a saved OCR fixture are available.
    Action: Run the pipeline end-to-end with an EPUB output path.
    Assertions: The pipeline writes EPUB output, intermediate artifacts and packaged images.
    Requirements: book-converter.2, book-converter.4, book-converter.5, book-converter.6, book-converter.7, book-converter.8"""
    source_path = create_dummy_source_document(tmp_path)
    output_path = tmp_path / "converted.epub"
    job_dir = tmp_path / "job"
    pipeline = BookPipeline(
        source_path=source_path,
        ocr_client=FixtureOcrClient(OCR_FIXTURE_PATH),
        job_dir=job_dir,
        output_path=output_path,
        keep_temp=True,
    )
    result_path = pipeline.handle()
    assert result_path == output_path
    assert output_path.exists()
    assert (job_dir / "ocr" / "ocr_response.json").exists()
    assert (job_dir / "ocr" / "normalized_pages.json").exists()
    image_files = sorted(path.name for path in (job_dir / "images").iterdir() if path.is_file())
    assert image_files
    assert (job_dir / "book" / "epub" / "mimetype").exists()
    assert (job_dir / "book" / "epub" / "META-INF" / "container.xml").exists()
    assert (job_dir / "book" / "epub" / "OEBPS" / "content.opf").exists()
    assert (job_dir / "book" / "epub" / "OEBPS" / "toc.ncx").exists()
    assert (job_dir / "book" / "epub" / "OEBPS" / "content.xhtml").exists()
    assert (job_dir / "book" / "epub" / "OEBPS" / "cover.xhtml").exists()
    with zipfile.ZipFile(output_path) as epub_archive:
        assert epub_archive.read("mimetype") == b"application/epub+zip"
        content_opf = epub_archive.read("OEBPS/content.opf").decode("utf-8")
        assert "<dc:title>sample_ocr_response</dc:title>" in content_opf
        assert 'id="cover" href="cover.xhtml"' in content_opf
        toc_ncx = epub_archive.read("OEBPS/toc.ncx").decode("utf-8")
        assert "sample_ocr_response" in toc_ncx
        cover_xhtml = epub_archive.read("OEBPS/cover.xhtml").decode("utf-8")
        assert "sample_ocr_response" in cover_xhtml
        content_xhtml = epub_archive.read("OEBPS/content.xhtml").decode("utf-8")
        assert "<h1>Паттерны разработки на Python</h1>" in content_xhtml
        assert "<h2>Endnotes</h2>" in content_xhtml
        assert "<section" in content_xhtml
        first_page = fixture_pages()[0]
        header = first_page.get("header")
        if isinstance(header, str) and header:
            assert header not in content_xhtml
        assert any(f"images/{image_name}" in content_xhtml for image_name in image_files)
