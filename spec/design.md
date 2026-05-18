# Design: AI Book Converter CLI

## Overview

The system is implemented as a CLI pipeline that accepts a source book document, creates a separate `OCR job`, requests a hybrid page-by-page result from Mistral, and assembles the final reflowable book in EPUB format.

The current implementation already contains a basic pipeline in the `pdf_ocr.py` module: PDF upload, OCR call, JSON saving, image extraction, and HTML assembly. The target architecture extends this behavior into a full CLI utility with DJVU support, hybrid OCR for the first 20 pages through a multimodal LLM, EPUB assembly, footer footnote handling as endnotes, and a testing strategy without repeated live API calls.

## Architecture

### CLI Layer

The CLI command must:

- validate the input path and document format;
- support an optional job directory path and output file path;
- allow reuse of a previously created job directory;
- run the entire pipeline or individual stages for diagnostics and debugging.

Recommended CLI arguments:

- required argument for the source book path;
- `--job-dir` as an optional argument for artifact reuse or explicit placement;
- `--output` as an optional argument for the final file;
- `--model` as an optional argument for the OCR model;
- optional `--keep-temp` flag or an equivalent flag for preserving the temporary directory after completion.

### Pipeline Stages

The pipeline must be split into explicit stages:

1. `validate_input`
2. `prepare_job_dir`
3. `upload_source`
4. `request_llm_for_front_pages`
5. `request_ocr_for_remaining_pages`
6. `merge_ocr_payloads`
7. `normalize_ocr_response`
8. `extract_images`
9. `extract_body_and_footnotes`
10. `build_book_markup`
11. `package_epub`
12. `write_outputs`

Each stage must be idempotent with respect to the saved job directory state.

### Job Directory Layout

The temporary directory must store all artifacts required for reruns and diagnostics.

If the user did not pass `--job-dir`, the system must create a job directory inside `tempfile.tempdir()`. If the job directory was created automatically in a temporary directory, the system must delete it by default after successful processing. If the user explicitly passed `--job-dir`, the system must not delete it automatically. The CLI must provide an optional flag that allows preserving an automatically created temporary directory after completion.

Proposed structure:

```text
job_dir/
  state.json
  source/
    original.pdf | original.djvu
  ocr/
    ocr_response.json
    normalized_pages.json
  images/
    <image files>
  book/
    body.md
    endnotes.md
    content.html
    content.opf
    toc.ncx
  output/
    <book>.epub
  logs/
    pipeline.log
```

The current `state.json`, `ocr_response.json`, `images/`, and `content.html` files from `pdf_ocr.py` must be preserved as the foundation, but distributed into a clearer directory structure.

## OCR Response Model

The normalized OCR response must describe a page as the following structure:

- `page_index`
- `body_markdown`
- `headers: list[str]`
- `footers: list[str]`
- `images: list[PageImage]`
- `warnings: list[str]`

`PageImage` must contain:

- `image_id`
- `source_path`
- `width`
- `height`
- `page_index`
- `anchor_id`

Normalization is needed because the actual OCR response may contain raw page markdown together with separate header/footer/image metadata, while the book assembly logic must work on a stable internal model.

## Input Format Support

### PDF

A PDF must be sent to Mistral once. Then:

- the first 20 pages are read through the multimodal LLM over the same document;
- the remaining pages are read through the current OCR API;
- results are merged into a single OCR payload before the normalization stage.

### DJVU

DJVU requires one of two compatible approaches:

1. Direct DJVU upload support in the OCR API, if allowed by the external service.
2. Preliminary DJVU-to-PDF conversion as a separate pipeline stage before `upload_source`.

Because the current code can only work with one input file and does not contain a converter, the implementation must include a `SourcePreprocessor` abstraction with `PdfSourcePreprocessor` and `DjvuSourcePreprocessor` branches.

## Content Assembly Rules

### Headers

Header blocks are completely excluded from the final book. They may be stored only in diagnostic intermediate data so that information is not lost during OCR quality analysis.

### Body

Page body content is the only source of the main book text. Markdown markup must be converted to HTML while preserving:

- headings;
- paragraphs;
- lists;
- tables, if OCR returns them;
- embedded images.

### Footers and Endnotes

For a reflowable EPUB, moving footer footnotes to the end of the book as endnotes is preferable to trying to preserve them as per-page footnotes, because EPUB does not preserve the concept of an original page as a stable visual unit. Therefore, the chosen design is:

- footer is not included in the page text flow;
- each footnote receives a global sequential identifier;
- an anchor link to the endnote is inserted into the body where a footnote marker is detected;
- the endnotes section contains a list of notes in order of appearance;
- each endnote entry contains a backlink to the call site if matching succeeded;
- unmatched footer entries are added to the end of the section as unlinked notes.

This solution transfers better to e-readers than attempting to preserve the original pagination.

### Images

Images are extracted from the OCR response, written to `images/`, and then embedded into the HTML/ebook package through relative links. If the OCR markdown already contains image placeholders, they are replaced with links to local files.

Image priorities:

1. save the file itself;
2. save dimensions and coordinates if they are needed for adaptive layout;
3. embed the image near the corresponding body block.

## Book Packaging

Recommended assembly flow:

1. Normalized markdown/HTML is assembled into a single HTML book.
2. Endnotes and navigation anchors are generated.
3. Service ebook package files required by the selected build tool are created.
4. HTML, service files, and images are packaged into EPUB.

Because the current implementation stops at HTML, packaging must be extracted into a separate module, for example `book_packager.py`, so that OCR logic and ebook assembly logic remain isolated.

## State Management and Resume

`state.json` must store:

- path to the source file;
- actual normalized source format;
- current stage;
- `file_id` or an equivalent identifier of the external OCR resource;
- artifact paths;
- errors and warnings from the last step.

Resuming work must rely on already prepared artifacts instead of repeating stages unnecessarily.

## Error Handling

Errors are divided into:

- input validation errors;
- OCR API errors;
- image decoding errors;
- final book construction errors;
- file system errors.

For each error class, the system must:

- terminate the current stage with a clear message;
- save diagnostic artifacts;
- not delete the job directory automatically on failure.

## Test Strategy

### Unit Tests

- `tests/unit/test_input_validation.py` - verifies input format and path validation.
- `tests/unit/test_job_state.py` - verifies pipeline state saving and loading.
- `tests/unit/test_ocr_client.py` - verifies hybrid OCR merging and LLM JSON parsing.
- `tests/unit/test_page_normalization.py` - verifies body, header, and footer extraction.
- `tests/unit/test_endnotes.py` - verifies footnote movement and link generation.
- `tests/unit/test_image_extraction.py` - verifies image decoding and saving.
- `tests/unit/test_html_builder.py` - verifies HTML assembly from the normalized page model.
- `tests/unit/test_epub_packager.py` - verifies package generation for the final book.

### Functional Tests

- `tests/functional/test_cli_conversion.py` - runs the CLI on a fixture OCR response and verifies final artifacts.
- `tests/functional/test_resume_pipeline.py` - verifies resuming from the middle of the pipeline.
- `tests/functional/test_endnotes_generation.py` - verifies footnote behavior in the final book.
- `tests/functional/test_fixture_loading.py` - confirms operation without a network call.

### Hybrid OCR Strategy

Hybrid OCR must be implemented in a separate adapter on top of the Mistral SDK.

- `HybridMistralOcrClient` or an equivalent component uploads the document once;
- the multimodal LLM receives the document and returns OCR-like JSON only for the first 20 pages;
- the OCR API receives the same document and returns the full OCR payload;
- pages 1-20 from the OCR payload are replaced with the LLM result, while pages 21+ remain from the OCR API;
- the final structure must match the current internal `normalize_ocr_response` format so that downstream stages do not distinguish the source of a page.

This merge approach is simpler than physically splitting the PDF into pages and does not require additional PDF tooling in the first implementation phase.

### OCR Test Fixture Strategy

The test book is taken from `tests/assets/`. There must be one saved OCR fixture for it, obtained by a single real `MistralOCR` call. Then:

- the fixture is stored in the repository or in an agreed test cache directory;
- unit and functional tests use the fixture by default;
- the live OCR test is not run automatically during regular `pytest`;
- a separate preparation scenario may regenerate the fixture manually.

This eliminates test instability, unnecessary network calls, and the cost of repeated OCR processing.

### Requirements Coverage

| Requirement | Unit Tests | Functional Tests |
|-------------|------------|-------------------|
| book-converter.1 | `tests/unit/test_input_validation.py` | `tests/functional/test_cli_validation.py`, `tests/functional/test_cli_conversion.py` |
| book-converter.2 | `tests/unit/test_job_state.py` | `tests/functional/test_job_directory.py`, `tests/functional/test_resume_pipeline.py` |
| book-converter.3 | `tests/unit/test_ocr_client.py` | `tests/functional/test_mistral_fixture_pipeline.py`, `tests/functional/test_mistral_api_error.py` |
| book-converter.4 | `tests/unit/test_page_normalization.py` | `tests/functional/test_page_content_selection.py`, `tests/functional/test_empty_page_blocks.py` |
| book-converter.5 | `tests/unit/test_endnotes.py` | `tests/functional/test_endnotes_generation.py`, `tests/functional/test_endnotes_links.py`, `tests/functional/test_unmatched_footnotes.py` |
| book-converter.6 | `tests/unit/test_image_extraction.py` | `tests/functional/test_image_extraction.py`, `tests/functional/test_image_embedding.py`, `tests/functional/test_broken_image_payload.py` |
| book-converter.7 | `tests/unit/test_epub_packager.py`, `tests/unit/test_html_builder.py` | `tests/functional/test_epub_output.py`, `tests/functional/test_epub_navigation.py` |
| book-converter.8 | `tests/unit/test_fixture_loader.py` | `tests/functional/test_fixture_loading.py`, `tests/functional/test_no_live_api_in_default_tests.py` |
