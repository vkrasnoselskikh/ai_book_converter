from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from ai_book_converter.json_types import JsonObject, JsonValue


logger = logging.getLogger(__name__)


# Requirements: book-converter.2, book-converter.6
@dataclass(frozen=True)
class PageImage:
    image_id: str
    source_path: str
    width: int
    height: int
    page_index: int
    anchor_id: str

    # Requirements: book-converter.4, book-converter.6
    @classmethod
    def from_ocr_payload(
        cls,
        page_index: int,
        image_payload: JsonObject,
        saved_path: Path,
    ) -> "PageImage":
        image_id = str(image_payload.get("id", saved_path.name))
        top_left_x = _as_int(image_payload.get("top_left_x"))
        top_left_y = _as_int(image_payload.get("top_left_y"))
        bottom_right_x = _as_int(image_payload.get("bottom_right_x"))
        bottom_right_y = _as_int(image_payload.get("bottom_right_y"))
        return cls(
            image_id=image_id,
            source_path=str(saved_path),
            width=max(0, bottom_right_x - top_left_x),
            height=max(0, bottom_right_y - top_left_y),
            page_index=page_index,
            anchor_id=f"page-{page_index}-image-{image_id}",
        )


# Requirements: book-converter.4, book-converter.5, book-converter.6
@dataclass(frozen=True)
class PageContent:
    page_index: int
    header_blocks: list[str]
    body_markdown: str
    footer_blocks: list[str]
    images: list[PageImage]
    warnings: list[str] = field(default_factory=list)

    # Requirements: book-converter.2, book-converter.4, book-converter.6
    def to_json(self) -> JsonObject:
        return {
            "page_index": self.page_index,
            "header_blocks": list(self.header_blocks),
            "body_markdown": self.body_markdown,
            "footer_blocks": list(self.footer_blocks),
            "images": [
                {
                    "image_id": image.image_id,
                    "source_path": image.source_path,
                    "width": image.width,
                    "height": image.height,
                    "page_index": image.page_index,
                    "anchor_id": image.anchor_id,
                }
                for image in self.images
            ],
            "warnings": list(self.warnings),
        }


# Requirements: book-converter.5, book-converter.7
@dataclass(frozen=True)
class Endnote:
    note_id: str
    ref_id: str
    marker: str | None
    text: str
    page_index: int
    linked: bool

    # Requirements: book-converter.2, book-converter.5
    def to_json(self) -> JsonObject:
        return {
            "note_id": self.note_id,
            "ref_id": self.ref_id,
            "marker": self.marker,
            "text": self.text,
            "page_index": self.page_index,
            "linked": self.linked,
        }


# Requirements: book-converter.2
class PipelineStep(StrEnum):
    VALIDATED = "validated"
    OCR_REQUESTED = "ocr_requested"
    IMAGES_EXTRACTED = "images_extracted"
    NORMALIZED = "normalized"
    HTML_RENDERED = "html_rendered"
    OUTPUT_WRITTEN = "output_written"


# Requirements: book-converter.2, book-converter.7
@dataclass
class PipelineState:
    source_path: str
    output_path: str
    model: str
    step: str
    auto_created_job_dir: bool
    keep_temp: bool
    file_id: str | None = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    # Requirements: book-converter.2
    def to_json(self) -> JsonObject:
        return {
            "source_path": self.source_path,
            "output_path": self.output_path,
            "model": self.model,
            "step": self.step,
            "auto_created_job_dir": self.auto_created_job_dir,
            "keep_temp": self.keep_temp,
            "file_id": self.file_id,
            "warnings": list(self.warnings),
            "errors": list(self.errors),
        }

    # Requirements: book-converter.2
    @classmethod
    def from_json(cls, payload: JsonObject) -> "PipelineState":
        return cls(
            source_path=str(payload["source_path"]),
            output_path=str(payload["output_path"]),
            model=str(payload["model"]),
            step=str(payload["step"]),
            auto_created_job_dir=bool(payload["auto_created_job_dir"]),
            keep_temp=bool(payload["keep_temp"]),
            file_id=_as_optional_str(payload.get("file_id")),
            warnings=_as_string_list(payload.get("warnings")),
            errors=_as_string_list(payload.get("errors")),
        )


# Requirements: book-converter.2
def _as_optional_str(value: JsonValue) -> str | None:
    if value is None:
        return None
    return str(value)


# Requirements: book-converter.2
def _as_string_list(value: JsonValue) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


# Requirements: book-converter.4, book-converter.6
def _as_int(value: JsonValue) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str) and value.strip():
        return int(float(value))
    return 0
