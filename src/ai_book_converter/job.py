from __future__ import annotations

import json
import logging
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from ai_book_converter.config import JOB_DIR_PREFIX
from ai_book_converter.models import PipelineState


logger = logging.getLogger(__name__)


# Requirements: book-converter.2
@dataclass(frozen=True)
class JobPaths:
    root_dir: Path
    source_dir: Path
    ocr_dir: Path
    images_dir: Path
    book_dir: Path
    epub_dir: Path
    epub_meta_inf_dir: Path
    epub_oebps_dir: Path
    epub_images_dir: Path
    output_dir: Path
    logs_dir: Path
    state_path: Path
    ocr_response_path: Path
    normalized_pages_path: Path
    body_markdown_path: Path
    endnotes_markdown_path: Path
    content_html_path: Path
    content_xhtml_path: Path
    package_opf_path: Path
    toc_ncx_path: Path
    container_xml_path: Path
    mimetype_path: Path

    # Requirements: book-converter.2
    def source_copy_path(self, suffix: str) -> Path:
        return self.source_dir / f"original{suffix}"


# Requirements: book-converter.2
def create_job_paths(job_dir: Path | None) -> tuple[JobPaths, bool]:
    auto_created = job_dir is None
    if auto_created:
        root_dir = Path(tempfile.mkdtemp(prefix=JOB_DIR_PREFIX, dir=tempfile.gettempdir()))
    else:
        root_dir = job_dir.expanduser().resolve()
        root_dir.mkdir(parents=True, exist_ok=True)
    source_dir = root_dir / "source"
    ocr_dir = root_dir / "ocr"
    images_dir = root_dir / "images"
    book_dir = root_dir / "book"
    epub_dir = book_dir / "epub"
    epub_meta_inf_dir = epub_dir / "META-INF"
    epub_oebps_dir = epub_dir / "OEBPS"
    epub_images_dir = epub_oebps_dir / "images"
    output_dir = root_dir / "output"
    logs_dir = root_dir / "logs"
    for directory in (
        source_dir,
        ocr_dir,
        images_dir,
        book_dir,
        epub_dir,
        epub_meta_inf_dir,
        epub_oebps_dir,
        epub_images_dir,
        output_dir,
        logs_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)
    return (
        JobPaths(
            root_dir=root_dir,
            source_dir=source_dir,
            ocr_dir=ocr_dir,
            images_dir=images_dir,
            book_dir=book_dir,
            epub_dir=epub_dir,
            epub_meta_inf_dir=epub_meta_inf_dir,
            epub_oebps_dir=epub_oebps_dir,
            epub_images_dir=epub_images_dir,
            output_dir=output_dir,
            logs_dir=logs_dir,
            state_path=root_dir / "state.json",
            ocr_response_path=ocr_dir / "ocr_response.json",
            normalized_pages_path=ocr_dir / "normalized_pages.json",
            body_markdown_path=book_dir / "body.md",
            endnotes_markdown_path=book_dir / "endnotes.md",
            content_html_path=book_dir / "content.html",
            content_xhtml_path=epub_oebps_dir / "content.xhtml",
            package_opf_path=epub_oebps_dir / "content.opf",
            toc_ncx_path=epub_oebps_dir / "toc.ncx",
            container_xml_path=epub_meta_inf_dir / "container.xml",
            mimetype_path=epub_dir / "mimetype",
        ),
        auto_created,
    )


# Requirements: book-converter.2
def save_state(job_paths: JobPaths, state: PipelineState) -> None:
    job_paths.state_path.write_text(
        json.dumps(state.to_json(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# Requirements: book-converter.2
def load_state(job_paths: JobPaths) -> PipelineState | None:
    if not job_paths.state_path.exists():
        return None
    payload = json.loads(job_paths.state_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return None
    normalized_payload = {str(key): value for key, value in payload.items()}
    return PipelineState.from_json(normalized_payload)


# Requirements: book-converter.2
def copy_source_document(job_paths: JobPaths, source_path: Path) -> Path:
    destination = job_paths.source_copy_path(source_path.suffix.lower())
    if not destination.exists():
        shutil.copy2(source_path, destination)
    return destination


# Requirements: book-converter.2
def cleanup_job_dir(job_paths: JobPaths, output_path: Path, keep_temp: bool, auto_created: bool) -> None:
    if keep_temp or not auto_created:
        return
    if output_path.resolve().is_relative_to(job_paths.root_dir.resolve()):
        logger.warning("Keeping auto-created job directory because output is inside it: %s", output_path)
        return
    shutil.rmtree(job_paths.root_dir, ignore_errors=True)
