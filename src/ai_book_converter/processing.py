from __future__ import annotations

import base64
import json
import logging
import re
from pathlib import Path

from ai_book_converter.json_types import JsonObject, JsonValue
from ai_book_converter.models import Endnote, PageContent, PageImage


logger = logging.getLogger(__name__)

FOOTNOTE_MARKER_PATTERN = re.compile(r"^\s*\[?(?P<marker>\d+)\]?[.)]?\s*")
FENCED_BLOCK_PATTERN = re.compile(r"```(?P<lang>[^\n`]*)\n(?P<body>.*?)\n```", re.DOTALL)
PYTHON_LIKE_LANGUAGE_NAMES = {"python", "py", "txt", "text"}
DEDENT_PREFIXES = ("elif ", "else:", "except", "finally:")
PYTHON_HINTS = (
    "def ",
    "class ",
    "for ",
    "while ",
    "if ",
    "elif ",
    "else:",
    "try:",
    "except",
    "finally:",
    "return ",
    "import ",
    "from ",
    "@",
)


# Requirements: book-converter.2, book-converter.6
def extract_images(ocr_response: JsonObject, images_dir: Path) -> dict[tuple[int, str], Path]:
    images_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: dict[tuple[int, str], Path] = {}
    for page_payload in _object_list(ocr_response.get("pages")):
        page_index = _page_index(page_payload)
        for image_payload in _object_list(page_payload.get("images")):
            image_id = str(image_payload.get("id", f"page-{page_index}-image.bin"))
            base64_payload = _as_string(image_payload.get("image_base64"))
            if not base64_payload:
                continue
            image_bytes = _decode_base64_image(base64_payload)
            image_path = images_dir / image_id
            image_path.write_bytes(image_bytes)
            saved_paths[(page_index, image_id)] = image_path
    return saved_paths


# Requirements: book-converter.2, book-converter.4, book-converter.6
def normalize_ocr_response(
    ocr_response: JsonObject,
    saved_images: dict[tuple[int, str], Path],
) -> list[PageContent]:
    normalized_pages: list[PageContent] = []
    for page_payload in _object_list(ocr_response.get("pages")):
        page_index = _page_index(page_payload)
        header_blocks = _extract_text_blocks(page_payload, "headers", "header")
        footer_blocks = _extract_text_blocks(page_payload, "footers", "footer")
        markdown_text = _as_string(page_payload.get("markdown"))
        body_markdown = _strip_boundary_blocks(markdown_text, header_blocks, footer_blocks)
        body_markdown = normalize_code_blocks(body_markdown)
        images = [
            PageImage.from_ocr_payload(
                page_index=page_index,
                image_payload=image_payload,
                saved_path=saved_images.get(
                    (page_index, str(image_payload.get("id", ""))),
                    Path(str(saved_images.get((page_index, str(image_payload.get("id", ""))), Path("")))),
                ),
            )
            for image_payload in _object_list(page_payload.get("images"))
            if (page_index, str(image_payload.get("id", ""))) in saved_images
        ]
        warnings: list[str] = []
        if not body_markdown.strip():
            warnings.append("Page body is empty after normalization.")
        normalized_pages.append(
            PageContent(
                page_index=page_index,
                header_blocks=header_blocks,
                body_markdown=body_markdown,
                footer_blocks=footer_blocks,
                images=images,
                warnings=warnings,
            )
        )
    return normalized_pages


# Requirements: book-converter.2, book-converter.4, book-converter.5
def save_normalized_pages(normalized_pages: list[PageContent], output_path: Path) -> None:
    output_path.write_text(
        json.dumps([page.to_json() for page in normalized_pages], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# Requirements: book-converter.5, book-converter.7
def build_endnotes(pages: list[PageContent]) -> tuple[list[PageContent], list[Endnote]]:
    rewritten_pages: list[PageContent] = []
    endnotes: list[Endnote] = []
    note_counter = 1
    for page in pages:
        body_markdown = page.body_markdown
        for footer_block in page.footer_blocks:
            marker = _extract_marker(footer_block)
            note_id = f"endnote-{note_counter}"
            ref_id = f"endnote-ref-{note_counter}"
            linked = False
            if marker is not None:
                for candidate in (f"[{marker}]", f"^{marker}", f"({marker})"):
                    if candidate in body_markdown:
                        body_markdown = body_markdown.replace(
                            candidate,
                            f'<sup id="{ref_id}"><a href="#{note_id}">{candidate}</a></sup>',
                            1,
                        )
                        linked = True
                        break
            endnotes.append(
                Endnote(
                    note_id=note_id,
                    ref_id=ref_id,
                    marker=marker,
                    text=_strip_marker(footer_block),
                    page_index=page.page_index,
                    linked=linked,
                )
            )
            note_counter += 1
        rewritten_pages.append(
            PageContent(
                page_index=page.page_index,
                header_blocks=page.header_blocks,
                body_markdown=body_markdown,
                footer_blocks=page.footer_blocks,
                images=page.images,
                warnings=page.warnings,
            )
        )
    return rewritten_pages, endnotes


# Requirements: book-converter.4, book-converter.7
def normalize_code_blocks(markdown_text: str) -> str:
    return FENCED_BLOCK_PATTERN.sub(_normalize_fenced_block_match, markdown_text)


# Requirements: book-converter.4, book-converter.5
def _strip_boundary_blocks(markdown_text: str, headers: list[str], footers: list[str]) -> str:
    normalized_text = markdown_text.strip()
    for header in headers:
        header_text = header.strip()
        if header_text and normalized_text.startswith(header_text):
            normalized_text = normalized_text[len(header_text) :].lstrip()
    for footer in footers:
        footer_text = footer.strip()
        if footer_text and normalized_text.endswith(footer_text):
            normalized_text = normalized_text[: -len(footer_text)].rstrip()
    return normalized_text


# Requirements: book-converter.5
def _extract_marker(footer_text: str) -> str | None:
    match = FOOTNOTE_MARKER_PATTERN.match(footer_text)
    if match is None:
        return None
    return match.group("marker")


# Requirements: book-converter.5
def _strip_marker(footer_text: str) -> str:
    return FOOTNOTE_MARKER_PATTERN.sub("", footer_text, count=1).strip()


# Requirements: book-converter.4, book-converter.7
def _normalize_fenced_block_match(match: re.Match[str]) -> str:
    language = match.group("lang").strip()
    body = match.group("body")
    if not _should_reindent_code_block(language, body):
        return match.group(0)
    normalized_body = _reindent_python_like_code(body)
    return f"```{language}\n{normalized_body}\n```"


# Requirements: book-converter.4, book-converter.7
def _should_reindent_code_block(language: str, body: str) -> bool:
    if language.lower() not in PYTHON_LIKE_LANGUAGE_NAMES:
        return False
    stripped_lines = [line.strip() for line in body.splitlines() if line.strip()]
    if len(stripped_lines) < 2:
        return False
    return any(line.startswith(PYTHON_HINTS) for line in stripped_lines)


# Requirements: book-converter.4, book-converter.7
def _reindent_python_like_code(body: str) -> str:
    formatted_lines: list[str] = []
    indent_level = 0
    bracket_depth = 0
    continuation_indent = 0
    for raw_line in body.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            formatted_lines.append("")
            continue
        if stripped.startswith(DEDENT_PREFIXES):
            indent_level = max(0, indent_level - 1)
        if stripped[0] in ")]}" and continuation_indent > 0:
            current_indent = max(0, indent_level + continuation_indent - 1)
        else:
            current_indent = indent_level + continuation_indent
        formatted_lines.append(f"{'    ' * current_indent}{stripped}")
        bracket_depth = max(0, bracket_depth + _bracket_delta(stripped))
        continuation_indent = 1 if bracket_depth > 0 else 0
        if continuation_indent == 0 and stripped.endswith(":"):
            indent_level += 1
    return "\n".join(formatted_lines)


# Requirements: book-converter.4, book-converter.7
def _bracket_delta(line: str) -> int:
    open_count = sum(1 for char in line if char in "([{")
    close_count = sum(1 for char in line if char in ")]}")
    return open_count - close_count


# Requirements: book-converter.6
def _decode_base64_image(base64_payload: str) -> bytes:
    payload = base64_payload.split(",", maxsplit=1)[-1]
    return base64.b64decode(payload)


# Requirements: book-converter.4
def _extract_text_blocks(page_payload: JsonObject, plural_key: str, singular_key: str) -> list[str]:
    blocks = _string_list(page_payload.get(plural_key))
    if blocks:
        return blocks
    singular_value = _as_string(page_payload.get(singular_key))
    return [singular_value] if singular_value else []


# Requirements: book-converter.4
def _page_index(page_payload: JsonObject) -> int:
    raw_index = page_payload.get("index", page_payload.get("page_index", 0))
    if isinstance(raw_index, bool):
        return int(raw_index)
    if isinstance(raw_index, int):
        return raw_index
    if isinstance(raw_index, float):
        return int(raw_index)
    if isinstance(raw_index, str) and raw_index.strip():
        return int(float(raw_index))
    return 0


# Requirements: book-converter.4, book-converter.6
def _object_list(value: JsonValue) -> list[JsonObject]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


# Requirements: book-converter.4
def _string_list(value: JsonValue) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


# Requirements: book-converter.4
def _as_string(value: JsonValue) -> str:
    if value is None:
        return ""
    return str(value)
