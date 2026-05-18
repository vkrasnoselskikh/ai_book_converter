# Requirements Document: AI Book Converter CLI

## Introduction

The project must provide a CLI utility for converting books in PDF and DJVU formats into an ebook suitable for reading on modern e-readers. The utility must send the source document through an OCR/LLM pipeline based on Mistral, receive a structured OCR result, process content page by page, and assemble the final book in EPUB format.

## Glossary

- **Source document** - the original book in PDF or DJVU format.
- **OCR job** - a single recognition and book assembly process for one source document.
- **Job directory** - a temporary directory containing processing artifacts for a specific book.
- **Body block** - the main useful page content intended to be transferred into the final book.
- **Header block** - the upper service block of a page that must not be included in the final book.
- **Footer block** - the lower service block of a page containing footnotes or other page notes.
- **Endnotes** - a book section at the end of the final file where footnotes from footer blocks are moved.
- **Intermediate artifacts** - temporary processing files: JSON responses, extracted images, intermediate markup.

## Requirements

### 1. CLI and Input Handling

**ID:** book-converter.1

**User Story:** As a user, I want to start book conversion from the command line so that I can convert a source file into a compatible ebook without manual processing.

#### Acceptance Criteria

1.1. WHEN the user starts the CLI, the system SHALL accept the source document path as a required argument.
1.2. WHEN the user provides a source document, the system SHALL support PDF and DJVU formats.
1.3. IF the source document path does not exist, the system SHALL exit with a clear error.
1.4. IF the file extension is unsupported, the system SHALL exit with a clear error.
1.5. WHEN the user starts processing, the system SHALL allow specifying the job working directory or creating it automatically.
1.6. WHEN the user starts processing, the system SHALL allow specifying the OCR model and book output assembly parameters.

#### Functional Tests

- `tests/functional/test_cli_conversion.py` - running the CLI with PDF and DJVU.
- `tests/functional/test_cli_validation.py` - errors for a missing file and unsupported format.

### 2. OCR Job Lifecycle

**ID:** book-converter.2

**User Story:** As a user, I want conversion to run as a reproducible pipeline with persisted state so that processing can be analyzed and resumed when needed.

#### Acceptance Criteria

2.1. WHEN book processing starts, the system SHALL create a job directory in a temporary directory or at a user-provided path.
2.2. WHEN the job directory is created, the system SHALL store pipeline state in it.
2.3. WHEN an OCR job runs, the system SHALL store the raw `MistralOCR` JSON response in the job directory.
2.4. WHEN an OCR job runs, the system SHALL store intermediate processing artifacts in the job directory.
2.5. IF processing is interrupted after the job directory has been created, the system SHALL preserve enough data for diagnostics and resumption.

#### Functional Tests

- `tests/functional/test_job_directory.py` - job directory creation and reuse.
- `tests/functional/test_resume_pipeline.py` - pipeline resumption from saved state.

### 3. Mistral OCR Integration

**ID:** book-converter.3

**User Story:** As a user, I want the document to be sent to `MistralOCR` and returned in a structured form so that the system can assemble a correct ebook from it.

#### Acceptance Criteria

3.1. WHEN the OCR stage starts, the system SHALL upload the source document to the Mistral processing pipeline.
3.2. WHEN the document is uploaded, the system SHALL process the first 20 pages through a multimodal LLM.
3.3. WHEN the document is uploaded, the system SHALL process pages starting from page 21 through the current OCR API.
3.4. WHEN the OCR/LLM stage returns a result, the system SHALL receive a single page-by-page structured JSON.
3.5. WHEN the OCR/LLM stage returns a result, the system SHALL store page markdown content, header, footer, and image information.
3.6. IF the OCR API or LLM stage returns an error, the system SHALL terminate the current stage with a diagnosable message and saved intermediate data.

#### Functional Tests

- `tests/functional/test_mistral_fixture_pipeline.py` - document processing based on a saved OCR fixture.
- `tests/functional/test_mistral_api_error.py` - response to an OCR API error.

### 4. Page Content Extraction

**ID:** book-converter.4

**User Story:** As a user, I want useful book content to be correctly extracted from pages so that the final book contains only readable text and illustrations.

#### Acceptance Criteria

4.1. WHEN an OCR result page is processed, the system SHALL ignore the header block.
4.2. WHEN an OCR result page is processed, the system SHALL include the body block in the main book text flow.
4.3. WHEN the body block contains markdown markup, the system SHALL preserve its semantics when converting it into the final book.
4.4. WHEN a page has no body block, the system SHALL skip the page without error and record this in intermediate data.
4.5. IF the OCR response contains unexpected or empty blocks, the system SHALL handle them without crashing.

#### Functional Tests

- `tests/functional/test_page_content_selection.py` - excluding header and including body.
- `tests/functional/test_empty_page_blocks.py` - handling empty and incomplete pages.

### 5. Footnotes and Endnotes

**ID:** book-converter.5

**User Story:** As a user, I want footnotes from footers to be preserved and remain readable in the final ebook so that it retains the meaning of the original in a reflowable format.

#### Acceptance Criteria

5.1. WHEN a page OCR result contains a footer block with footnotes, the system SHALL extract them as page notes.
5.2. WHEN a footnote is extracted, the system SHALL exclude the footer block from the main page text flow.
5.3. WHEN the final book is assembled, the system SHALL move extracted footnotes into a separate endnotes section at the end of the book.
5.4. WHEN body text contains footnote references or markers, the system SHALL create navigation links in the final book between the reference location and the corresponding endnotes entry.
5.5. IF a footer block cannot be reliably matched to a marker in the body, the system SHALL preserve the note text in endnotes as an unlinked footnote instead of losing it.

#### Functional Tests

- `tests/functional/test_endnotes_generation.py` - moving footer content to the end of the book.
- `tests/functional/test_endnotes_links.py` - generating links between body and endnotes.
- `tests/functional/test_unmatched_footnotes.py` - preserving unlinked notes.

### 6. Image Preservation

**ID:** book-converter.6

**User Story:** As a user, I want illustrations from the book to be preserved and included in the final book so that the electronic version does not lose visual content.

#### Acceptance Criteria

6.1. WHEN a page OCR response contains images, the system SHALL extract them from the OCR response and save them in the job directory.
6.2. WHEN images are extracted, the system SHALL include them in the final book at locations corresponding to the page body content.
6.3. IF the OCR API returns images in base64 representation, the system SHALL decode them and save them in the file system.
6.4. IF an image is corrupted or missing, the system SHALL continue book assembly while preserving diagnostic information.

#### Functional Tests

- `tests/functional/test_image_extraction.py` - saving images from an OCR fixture.
- `tests/functional/test_image_embedding.py` - embedding images into the final book.
- `tests/functional/test_broken_image_payload.py` - graceful degradation for an invalid image.

### 7. EPUB Book Assembly

**ID:** book-converter.7

**User Story:** As an e-reader user, I want to receive a book in EPUB format with a readable structure so that I can read the OCR result like a regular ebook.

#### Acceptance Criteria

7.1. WHEN the main text, images, and endnotes are prepared, the system SHALL assemble the final book in EPUB format.
7.2. WHEN the final book is assembled, the system SHALL use reflowable markup suitable for e-reader screens.
7.3. WHEN the final book is created, the system SHALL preserve the logical page sequence of the source document.
7.4. WHEN the final book is created, the system SHALL include a table of contents or other navigation over major structural blocks if they are available from OCR data.
7.5. WHEN the final book is created, the system SHALL save it to an explicitly defined output path.

#### Functional Tests

- `tests/functional/test_epub_output.py` - EPUB file generation.
- `tests/functional/test_epub_navigation.py` - navigation and endnotes in the final book.

### 8. Test Data and Mocking Strategy

**ID:** book-converter.8

**User Story:** As a developer, I want to use one real OCR response as a test fixture so that subsequent tests are deterministic and do not depend on an external API.

#### Acceptance Criteria

8.1. WHEN test data is prepared, the system SHALL use a book from the `tests/assets` directory.
8.2. WHEN an OCR fixture is created for tests, the system SHALL send the test book to `MistralOCR` only once manually or through a separate preparation command.
8.3. WHEN the OCR fixture is saved, automated tests SHALL use the saved JSON instead of making another network call.
8.4. WHEN unit and functional tests run, they SHALL NOT require access to the real OCR API by default.
8.5. IF the OCR fixture is missing, the system SHALL provide a clear instruction for preparing it instead of failing silently.

#### Functional Tests

- `tests/functional/test_fixture_loading.py` - using the saved OCR JSON.
- `tests/functional/test_no_live_api_in_default_tests.py` - confirming that no network call is made by default.
