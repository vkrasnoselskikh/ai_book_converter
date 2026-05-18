# Task List: AI Book Converter CLI

## Overview

The specification describes the transition from the current OCR pipeline prototype to a CLI utility for assembling a book in EPUB format.

**Current status:** Phase 3 - Core Refactor and Fixture-Based Pipeline

---

## CRITICAL RULES

- Do not perform repeated live OCR calls in regular tests.
- Do not lose footer footnotes during book assembly.
- Do not mix OCR logic and ebook packaging into one indivisible module.
- Do not automatically delete temporary artifacts when the pipeline fails.

---

## Current State

### Completed

- ✅ The current code in `pdf_ocr.py` has been analyzed and the current behavior has been documented: PDF upload, OCR request, JSON, images, HTML.
- ✅ The target specification for CLI, OCR job directory, footnotes/endnotes, and EPUB assembly has been documented.
- ✅ The testing strategy using one saved OCR fixture from `tests/assets` has been defined.
- ✅ A new `src/ai_book_converter` package has been created and the main working code has been moved there.
- ✅ CLI, job directory management, state persistence, and offline OCR fixture client have been implemented.
- ✅ Image extraction, page normalization, header exclusion, and moving footer content to endnotes have been implemented.
- ✅ The old live test has been replaced with unit and functional tests without a required network call.
- ✅ Basic EPUB export has been implemented with packaging of `mimetype`, `container.xml`, `content.opf`, `toc.ncx`, XHTML content, and images.
- ✅ Unit and functional tests for EPUB assembly have been added.
- ✅ A real OCR fixture has been obtained from the book in `tests/assets`, and tests have been adapted to the actual Mistral OCR response structure.
- ✅ Hybrid OCR has been implemented: during a live run, the first 20 pages are replaced with the multimodal LLM result on top of the base OCR payload.

### In Progress

- 🔄 Refining EPUB navigation, compatibility with real e-readers, and pipeline resume scenarios.

### Planned

#### Phase 2: Core Refactor

- [x] Extract domain entities for OCR pages, images, and notes.
- [x] Split the pipeline into explicit stages with state persistence.
- [x] Move OCR API work into a separate client/adapter.
- [x] Prepare the job directory structure according to the specification.

#### Phase 3: Content Processing

- [x] Implement OCR response normalization.
- [x] Implement header block exclusion.
- [x] Implement moving body blocks into the main book flow.
- [x] Implement footer block extraction into endnotes.
- [x] Implement matching footnote links between body and endnotes.
- [ ] Implement safe handling of unmatched footnotes.
- [x] Implement image saving and embedding.

#### Phase 4: Output Packaging

- [x] Implement assembly of intermediate HTML book content.
- [x] Implement navigation and service ebook package file generation.
- [x] Implement final book export to EPUB.
- [ ] Verify compatibility of the output book with e-readers.

#### Phase 5: Input Coverage

- [x] Implement PDF support as the base format.
- [ ] Design and implement DJVU support through direct upload or conversion to PDF.
- [x] Add validation for unsupported formats.

#### Phase 6: Testing

- [x] Obtain real OCR JSON once for the book from `tests/assets`.
- [x] Save the fixture and its loading mechanism in tests.
- [x] Rewrite the current live test into mocked/fixture-based scenarios.
- [x] Add unit tests for all key functions.
- [x] Add unit tests for hybrid OCR merge and LLM replacement of the first 20 pages.
- [ ] Add functional tests for CLI, resume, and endnotes assembly.

#### Phase 7: Hardening

- [ ] Add diagnostic messages and stage-by-stage logging.
- [ ] Add robust handling of OCR, image, and file system errors.
- [ ] Verify idempotency of reruns based on `state.json`.
- [ ] Perform full validation of linting, typing, and test coverage.
