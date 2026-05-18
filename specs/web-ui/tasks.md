# Task List: AI Book Converter Web UI

## Overview

This specification describes the future implementation of "apps/web-ui": React TSX frontend, Node.js TypeScript backend, SSR, TypeORM Data Mapper, SQLite, and a TypeScript port of selected current converter logic.

**Current status:** Phase 0 - Specification

---

## CRITICAL RULES

- Do not implement code before a separate implementation plan is confirmed.
- Do not change the existing Python CLI without a separate requirement.
- Do not lose the ability to replace SQLite with Postgres in the future.
- Do not store several book records for the same book when it is available to several users.
- Do not use identifiers other than UUID for user, book, and link records.
- Do not store book files outside `AI_BOOK_COVERTER_BOOKS_PATH/<book_id>`.
- Do not expose internal paths, stack traces, or secrets in client-facing errors.

---

## Current State

### Completed

- ✅ Current Python logic in `src/ai_book_converter` has been analyzed: pipeline, models, page processing, images, tables, footnotes, HTML/EPUB rendering, and working directories.
- ✅ Existing Python converter tests have been analyzed, including processing unit tests and the EPUB output functional test.
- ✅ Requirements for the new web application have been documented without changing code.

### In Progress

- 🔄 The "AI Book Converter Web UI" specification is prepared for review before implementation.

### Planned

#### Phase 1: Project Scaffold

- [ ] Create `apps/web-ui`.
- [ ] Configure TypeScript for frontend and backend.
- [ ] Add React TSX.
- [ ] Add daisyUI `5.5.19` through CSS.
- [ ] Configure `emerald` as the day theme and `forest` as the night theme.
- [ ] Add baseline lint, typecheck, and test commands for `apps/web-ui`.

#### Phase 2: SSR and SPA Shell

- [ ] Implement server-side rendering for the home page.
- [ ] Implement React client hydration.
- [ ] Create "AppShell" with header bar, upload block, metadata block, preview block, and footer.
- [ ] Implement empty states before a book is loaded.
- [ ] Add functional tests for the first screen and themes.

#### Phase 3: Database Layer

- [ ] Configure TypeORM Data Mapper.
- [ ] Configure SQLite as the first driver.
- [ ] Create the "User" entity.
- [ ] Create the "Book" entity.
- [ ] Create the "BookMetadata" entity.
- [ ] Create the "UserBook" entity.
- [ ] Add UUIDs for all identifiers.
- [ ] Add a unique constraint for the "userId" and "bookId" link.
- [ ] Add repositories without direct SQL access in services.

#### Phase 4: File Storage

- [ ] Add centralized configuration for `AI_BOOK_COVERTER_BOOKS_PATH`.
- [ ] Create "BookStorageService".
- [ ] Create `AI_BOOK_COVERTER_BOOKS_PATH/<book_id>` when a book is created.
- [ ] Save the source EPUB/DJVU in the book directory.
- [ ] Save cover and preview artifacts in the book directory.
- [ ] Protect file serving from arbitrary relative paths.
- [ ] Add tests for successful saving and unavailable-directory errors.

#### Phase 5: Book Upload and Metadata

- [ ] Implement EPUB and DJVU upload.
- [ ] Implement rejection of unsupported formats.
- [ ] Create a book record after successful upload.
- [ ] Create a link between the current user and the book.
- [ ] Read available book metadata.
- [ ] Show metadata in the UI.
- [ ] Implement metadata editing and saving.
- [ ] Implement cover display, missing-cover state, and cover replacement.

#### Phase 6: Book Preview

- [ ] Prepare an EPUB preview representation.
- [ ] Prepare a DJVU preview representation strategy.
- [ ] Implement "BookReader".
- [ ] Display text, images, tables, and footnotes.
- [ ] Show processing status.
- [ ] Show a diagnostic message when preview preparation fails.

#### Phase 7: Converter Logic Port

- [ ] Port the book metadata model to TypeScript.
- [ ] Port the page model to TypeScript.
- [ ] Port the image model to TypeScript.
- [ ] Port the table model to TypeScript.
- [ ] Port the footnote model to TypeScript.
- [ ] Port the rules for removing headers and footers from the main text.
- [ ] Port saving images from base64.
- [ ] Port image and table placeholder replacement.
- [ ] Port endnotes construction.
- [ ] Port normalization of Python-like fenced code blocks.
- [ ] Add unit tests for the ported logic.

#### Phase 8: Validation and Hardening

- [ ] Verify that implementation matches requirements and design.
- [ ] Update `requirements.md` if behavior changes.
- [ ] Update `design.md` if architecture changes.
- [ ] Update the requirements coverage table.
- [ ] Run lint for `apps/web-ui`.
- [ ] Run typecheck for `apps/web-ui`.
- [ ] Run `apps/web-ui` unit tests.
- [ ] Run `apps/web-ui` functional tests.
- [ ] Verify overall project validation.
