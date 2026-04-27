from __future__ import annotations

import json
import logging
from pathlib import Path

from ai_book_converter.config import DEFAULT_OCR_MODEL, SUPPORTED_EXTENSIONS, default_output_path
from ai_book_converter.errors import InputValidationError
from ai_book_converter.job import cleanup_job_dir, copy_source_document, create_job_paths, load_state, save_state
from ai_book_converter.models import PageContent, PipelineState, PipelineStep
from ai_book_converter.ocr import OcrClient
from ai_book_converter.processing import build_endnotes, extract_images, normalize_ocr_response, save_normalized_pages
from ai_book_converter.renderer import publish_output, render_book_html, render_book_xhtml, render_body_sections, render_endnotes_html, write_book_artifacts


logger = logging.getLogger(__name__)


# Requirements: book-converter.2, book-converter.3
def _object_list(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


# Requirements: book-converter.1, book-converter.2, book-converter.3, book-converter.4, book-converter.5, book-converter.6, book-converter.7
class BookPipeline:
    # Requirements: book-converter.1, book-converter.2, book-converter.3, book-converter.7
    def __init__(
        self,
        source_path: Path,
        ocr_client: OcrClient,
        model: str = DEFAULT_OCR_MODEL,
        job_dir: Path | None = None,
        output_path: Path | None = None,
        keep_temp: bool = False,
    ) -> None:
        self.source_path = source_path.expanduser().resolve()
        self.output_path = default_output_path(self.source_path, output_path)
        self.model = model
        self.keep_temp = keep_temp
        self.ocr_client = ocr_client
        self.job_paths, self.auto_created_job_dir = create_job_paths(job_dir)
        self.state = load_state(self.job_paths) or PipelineState(
            source_path=str(self.source_path),
            output_path=str(self.output_path),
            model=self.model,
            step=PipelineStep.VALIDATED,
            auto_created_job_dir=self.auto_created_job_dir,
            keep_temp=keep_temp,
        )

    # Requirements: book-converter.1, book-converter.2, book-converter.3, book-converter.4, book-converter.5, book-converter.6, book-converter.7
    def handle(self) -> Path:
        logger.info(
            "Pipeline started: source=%s output=%s job_dir=%s model=%s keep_temp=%s",
            self.source_path,
            self.output_path,
            self.job_paths.root_dir,
            self.model,
            self.keep_temp,
        )
        logger.info("Starting input validation")
        self._validate_input()
        logger.info("Completed input validation: source=%s", self.source_path)
        logger.info("Starting source document copy")
        copied_source = copy_source_document(self.job_paths, self.source_path)
        logger.info("Completed source document copy: copied_source=%s", copied_source)
        logger.info("Starting OCR stage")
        ocr_response = self._ensure_ocr_response(copied_source)
        logger.info(
            "Completed OCR stage: ocr_pages=%s ocr_response_path=%s",
            len(_object_list(ocr_response.get("pages"))),
            self.job_paths.ocr_response_path,
        )
        logger.info("Starting normalization stage")
        normalized_pages = self._ensure_normalized_pages(ocr_response)
        logger.info(
            "Completed normalization stage: normalized_pages=%s normalized_pages_path=%s",
            len(normalized_pages),
            self.job_paths.normalized_pages_path,
        )
        logger.info("Starting render and publish stage")
        output_path = self._render_and_publish(normalized_pages)
        logger.info("Completed render and publish stage: output_path=%s", output_path)
        logger.info("Starting cleanup stage")
        cleanup_job_dir(
            self.job_paths,
            output_path=output_path,
            keep_temp=self.keep_temp,
            auto_created=self.auto_created_job_dir,
        )
        logger.info("Completed cleanup stage")
        logger.info("Pipeline finished successfully: output=%s", output_path)
        return output_path

    # Requirements: book-converter.1
    def _validate_input(self) -> None:
        logger.info("Validating input file: path=%s", self.source_path)
        if not self.source_path.exists():
            raise InputValidationError(f"Input file does not exist: {self.source_path}")
        if self.source_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise InputValidationError(
                f"Unsupported input format: {self.source_path.suffix}. Supported formats: PDF, DJVU."
            )
        self.state.step = PipelineStep.VALIDATED
        save_state(self.job_paths, self.state)
        logger.info("Input validated and state saved: step=%s state_path=%s", self.state.step, self.job_paths.state_path)

    # Requirements: book-converter.2, book-converter.3
    def _ensure_ocr_response(self, copied_source: Path) -> dict[str, object]:
        if self.job_paths.ocr_response_path.exists():
            logger.info("Reusing existing OCR response: path=%s", self.job_paths.ocr_response_path)
            return json.loads(self.job_paths.ocr_response_path.read_text(encoding="utf-8"))
        logger.info("Requesting OCR response: source=%s model=%s", copied_source, self.model)
        ocr_response = self.ocr_client.process_document(copied_source, self.model)
        self.job_paths.ocr_response_path.write_text(
            json.dumps(ocr_response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self.state.step = PipelineStep.OCR_REQUESTED
        save_state(self.job_paths, self.state)
        logger.info(
            "OCR response saved: step=%s state_path=%s ocr_response_path=%s",
            self.state.step,
            self.job_paths.state_path,
            self.job_paths.ocr_response_path,
        )
        return dict(ocr_response)

    # Requirements: book-converter.2, book-converter.4, book-converter.5, book-converter.6
    def _ensure_normalized_pages(self, ocr_response: dict[str, object]) -> list[PageContent]:
        logger.info("Extracting images: images_dir=%s", self.job_paths.images_dir)
        saved_images = extract_images(ocr_response, self.job_paths.images_dir)
        self.state.step = PipelineStep.IMAGES_EXTRACTED
        save_state(self.job_paths, self.state)
        logger.info(
            "Completed image extraction: step=%s extracted_images=%s state_path=%s",
            self.state.step,
            len(saved_images),
            self.job_paths.state_path,
        )
        logger.info("Normalizing OCR response into page content")
        normalized_pages = normalize_ocr_response(ocr_response, saved_images)
        save_normalized_pages(normalized_pages, self.job_paths.normalized_pages_path)
        self.state.step = PipelineStep.NORMALIZED
        save_state(self.job_paths, self.state)
        logger.info(
            "Completed normalization and saved pages: step=%s normalized_pages=%s normalized_pages_path=%s",
            self.state.step,
            len(normalized_pages),
            self.job_paths.normalized_pages_path,
        )
        return normalized_pages

    # Requirements: book-converter.4, book-converter.5, book-converter.6, book-converter.7
    def _render_and_publish(self, normalized_pages: list[PageContent]) -> Path:
        logger.info("Building endnotes for normalized pages")
        pages_with_notes, endnotes = build_endnotes(normalized_pages)
        logger.info(
            "Completed endnotes stage: pages=%s endnotes=%s",
            len(pages_with_notes),
            len(endnotes),
        )
        logger.info("Rendering HTML body sections")
        body_html = render_body_sections(pages_with_notes, image_href_prefix="../images")
        epub_body_html = render_body_sections(pages_with_notes, image_href_prefix="images")
        endnotes_html = render_endnotes_html(endnotes)
        content_html = render_book_html(body_html, endnotes_html)
        content_xhtml = render_book_xhtml(self.source_path.stem, epub_body_html, endnotes_html)
        write_book_artifacts(self.job_paths, body_html, endnotes_html, content_html, content_xhtml)
        self.state.step = PipelineStep.HTML_RENDERED
        save_state(self.job_paths, self.state)
        logger.info(
            "Completed render stage: step=%s body_html_chars=%s endnotes_html_chars=%s content_html_path=%s",
            self.state.step,
            len(body_html),
            len(endnotes_html),
            self.job_paths.content_html_path,
        )
        logger.info("Publishing final output: target=%s", self.output_path)
        output_path = publish_output(self.job_paths, self.output_path, title=self.source_path.stem)
        self.state.step = PipelineStep.OUTPUT_WRITTEN
        save_state(self.job_paths, self.state)
        logger.info(
            "Completed publish stage: step=%s output_path=%s state_path=%s",
            self.state.step,
            output_path,
            self.job_paths.state_path,
        )
        return output_path
