from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from json import JSONDecodeError
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, cast

from ai_book_converter.config import DEFAULT_LLM_MODEL, HYBRID_LLM_PAGE_COUNT
from ai_book_converter.errors import OcrProcessingError
from ai_book_converter.json_types import JsonObject, JsonValue

if TYPE_CHECKING:
    from mistralai import Mistral


logger = logging.getLogger(__name__)


# Requirements: book-converter.3, book-converter.8
class OcrClient(Protocol):
    def process_document(self, source_path: Path, model: str) -> JsonObject:
        ...


# Requirements: book-converter.3
@dataclass(frozen=True)
class UploadedDocument:
    file_id: str
    signed_url: str


# Requirements: book-converter.3
class HybridMistralOcrClient:
    def __init__(
        self,
        api_key: str,
        llm_model: str = DEFAULT_LLM_MODEL,
        llm_page_count: int = HYBRID_LLM_PAGE_COUNT,
    ) -> None:
        self._api_key = api_key
        self._llm_model = llm_model
        self._llm_page_count = llm_page_count

    # Requirements: book-converter.3
    def process_document(self, source_path: Path, model: str) -> JsonObject:
        try:
            from mistralai import Mistral

            with Mistral(api_key=self._api_key) as client:
                uploaded_document = self._upload_document(client, source_path)
                ocr_response = self._process_with_ocr(client, uploaded_document.file_id, model)
                llm_response = self._process_front_pages_with_llm(
                    client=client,
                    signed_url=uploaded_document.signed_url,
                    source_name=source_path.name,
                )
        except Exception as error:  # pragma: no cover - thin wrapper over external SDK
            raise OcrProcessingError(str(error)) from error
        return merge_hybrid_ocr_payloads(
            ocr_response=ocr_response,
            llm_response=llm_response,
            llm_page_count=self._llm_page_count,
        )

    # Requirements: book-converter.3
    def _upload_document(self, client: Mistral, source_path: Path) -> UploadedDocument:
        with source_path.open("rb") as content:
            uploaded_file = client.files.upload(
                file={"file_name": source_path.name, "content": content},
                purpose="ocr",
            )
        signed_url = client.files.get_signed_url(file_id=uploaded_file.id).url
        return UploadedDocument(file_id=uploaded_file.id, signed_url=signed_url)

    # Requirements: book-converter.3
    def _process_with_ocr(self, client: Mistral, file_id: str, model: str) -> JsonObject:
        response = client.ocr.process(
            model=model,
            document={"type": "file", "file_id": file_id},
            table_format="html",
            include_image_base64=True,
            extract_header=True,
            extract_footer=True,
        )
        return cast(JsonObject, json.loads(response.model_dump_json()))

    # Requirements: book-converter.3
    def _process_front_pages_with_llm(
        self,
        client: Mistral,
        signed_url: str,
        source_name: str,
    ) -> JsonObject:
        prompt = build_front_pages_llm_prompt(self._llm_page_count)
        response = client.chat.complete(
            model=self._llm_model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract OCR-like structured JSON for book pages. "
                        "Return valid JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "document_url",
                            "document_url": signed_url,
                            "document_name": source_name,
                        },
                    ],
                },
            ],
        )
        if not response.choices:
            raise OcrProcessingError("LLM response did not contain any choices.")
        content = extract_assistant_text(response.choices[0].message.content)
        return parse_llm_ocr_payload(content)


# Requirements: book-converter.3, book-converter.8
class FixtureOcrClient:
    def __init__(self, fixture_path: Path) -> None:
        self._fixture_path = fixture_path

    # Requirements: book-converter.3, book-converter.8
    def process_document(self, source_path: Path, model: str) -> JsonObject:
        del source_path
        del model
        payload = json.loads(self._fixture_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise OcrProcessingError(f"OCR fixture must be a JSON object: {self._fixture_path}")
        return cast(JsonObject, {str(key): value for key, value in payload.items()})


# Requirements: book-converter.3
def build_front_pages_llm_prompt(page_count: int) -> str:
    return (
        f"Read only pages 1 through {page_count} of the attached book and return a JSON object "
        'with shape {"pages": [...]}.\n'
        "Each page entry must contain:\n"
        '- "index": zero-based page index from the original document\n'
        '- "markdown": the main page content as markdown\n'
        '- "headers": list of detected header strings\n'
        '- "footers": list of detected footer or footnote strings\n'
        '- "images": an empty list\n'
        "Do not include any prose outside JSON. Preserve headings, paragraphs, tables, code fences, and footnote markers. "
        "Exclude pages outside the requested range."
    )


# Requirements: book-converter.3
def extract_assistant_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [_extract_text_chunk(chunk) for chunk in content]
        return "".join(part for part in parts if part)
    raise OcrProcessingError("LLM response content was not a supported text payload.")


# Requirements: book-converter.3
def parse_llm_ocr_payload(content: str) -> JsonObject:
    normalized_content = _strip_json_code_fence(content.strip())
    try:
        payload = json.loads(normalized_content)
    except JSONDecodeError as error:
        raise OcrProcessingError(f"LLM OCR payload is not valid JSON: {error.msg}") from error
    if not isinstance(payload, dict):
        raise OcrProcessingError("LLM OCR payload must be a JSON object.")
    normalized_payload = cast(JsonObject, {str(key): value for key, value in payload.items()})
    pages = normalized_payload.get("pages")
    if not isinstance(pages, list):
        raise OcrProcessingError('LLM OCR payload must contain a "pages" list.')
    return normalized_payload


# Requirements: book-converter.3
def merge_hybrid_ocr_payloads(
    ocr_response: JsonObject,
    llm_response: JsonObject,
    llm_page_count: int,
) -> JsonObject:
    base_pages = _object_list(ocr_response.get("pages"))
    if not base_pages:
        return dict(ocr_response)
    llm_pages = _normalize_llm_page_indexes(_object_list(llm_response.get("pages")), llm_page_count)
    llm_by_index = {_page_index(page): page for page in llm_pages}
    merged_pages: list[JsonObject] = []
    for base_page in base_pages:
        page_index = _page_index(base_page)
        if page_index >= llm_page_count or page_index not in llm_by_index:
            merged_pages.append(dict(base_page))
            continue
        merged_pages.append(_merge_page_payload(base_page, llm_by_index[page_index]))
    merged_response = dict(ocr_response)
    merged_response["pages"] = merged_pages
    return cast(JsonObject, merged_response)


# Requirements: book-converter.3
def _merge_page_payload(base_page: JsonObject, llm_page: JsonObject) -> JsonObject:
    merged_page = dict(base_page)
    for key in ("markdown", "header", "headers", "footer", "footers"):
        if key in llm_page:
            merged_page[key] = llm_page[key]
    if _object_list(llm_page.get("images")):
        merged_page["images"] = llm_page["images"]
    return cast(JsonObject, merged_page)


# Requirements: book-converter.3
def _normalize_llm_page_indexes(pages: list[JsonObject], llm_page_count: int) -> list[JsonObject]:
    if not pages:
        return []
    indexes = [_page_index(page) for page in pages]
    if indexes and min(indexes) >= 1 and max(indexes) <= llm_page_count and 0 not in indexes:
        return [_with_page_index(page, _page_index(page) - 1) for page in pages]
    normalized_pages: list[JsonObject] = []
    for page_offset, page in enumerate(pages):
        normalized_page = dict(page)
        if _page_index(normalized_page) < 0 or _page_index(normalized_page) >= llm_page_count:
            normalized_page["index"] = page_offset
        normalized_pages.append(cast(JsonObject, normalized_page))
    return normalized_pages


# Requirements: book-converter.3
def _with_page_index(page: JsonObject, page_index: int) -> JsonObject:
    normalized_page = dict(page)
    normalized_page["index"] = page_index
    return cast(JsonObject, normalized_page)


# Requirements: book-converter.3
def _extract_text_chunk(chunk: object) -> str:
    if isinstance(chunk, str):
        return chunk
    if isinstance(chunk, dict):
        text_value = chunk.get("text")
        if isinstance(text_value, str):
            return text_value
        return ""
    text_value = getattr(chunk, "text", None)
    if isinstance(text_value, str):
        return text_value
    return ""


# Requirements: book-converter.3
def _strip_json_code_fence(content: str) -> str:
    if not content.startswith("```"):
        return content
    lines = content.splitlines()
    if not lines:
        return content
    first_line = lines[0].strip()
    if not first_line.startswith("```"):
        return content
    if len(lines) > 1 and lines[-1].strip() == "```":
        return "\n".join(lines[1:-1]).strip()
    return content


# Requirements: book-converter.3
def _object_list(value: JsonValue | object) -> list[JsonObject]:
    if not isinstance(value, list):
        return []
    objects: list[JsonObject] = []
    for item in value:
        if isinstance(item, dict):
            objects.append(cast(JsonObject, {str(key): subvalue for key, subvalue in item.items()}))
    return objects


# Requirements: book-converter.3
def _page_index(page_payload: JsonObject) -> int:
    raw_index = page_payload.get("index", page_payload.get("page_index", 0))
    if isinstance(raw_index, int):
        return raw_index
    if isinstance(raw_index, float):
        return int(raw_index)
    if isinstance(raw_index, str) and raw_index.strip():
        return int(float(raw_index))
    return 0
