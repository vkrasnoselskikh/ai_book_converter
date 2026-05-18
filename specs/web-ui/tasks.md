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
- Do not use identifiers other than UUID for session, user, book, identity, and link records.
- Do not store book files outside `AI_BOOK_COVERTER_BOOKS_PATH/<book_id>`.
- Do not expose internal paths, stack traces, or secrets in client-facing errors.
- Do not require authentication before a user can upload, edit, and preview books.
- Do not lose anonymous session books or edits during authentication and account linking.
- Do not call LLM/OCR providers directly from HTTP routes; keep provider calls inside dedicated services.
- Do not expose raw page numbers as the user-facing target for table-of-contents navigation.

---

## Current State

### Completed

- ✅ Current Python logic in `src/ai_book_converter` has been analyzed: pipeline, models, page processing, images, tables, footnotes, HTML/EPUB rendering, and working directories.
- ✅ Existing Python converter tests have been analyzed, including processing unit tests and the EPUB output functional test.
- ✅ Requirements for the new web application have been documented without changing code.
- ✅ Anonymous-first usage has been specified: a visitor receives a session identifier, can work without authentication, and can later link session books to an authenticated account.
- ✅ OCR and LLM extraction flow has been specified: Mistral OCR page anchors, metadata agent over the first three pages, and table-of-contents agent over pages 3 through 10.
- ✅ Book processing URLs have been specified: upload updates the address bar, and users can return to the same URL to see processing status or continue editing.

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
- [ ] Add `@openai/agents` for metadata and table-of-contents agents.
- [ ] Add a Mistral Chat Completions compatible provider adapter for the Agents SDK.
- [ ] Add the Mistral TypeScript client for OCR where needed.

#### Phase 2: SSR and SPA Shell

- [ ] Implement server-side rendering for the home page.
- [ ] Implement server-side rendering for the book processing URL.
- [ ] Implement React client hydration.
- [ ] Create "AppShell" with header bar, upload block, metadata block, preview block, and footer.
- [ ] Create "HeaderBar" with left brand/current-book blocks and right profile block.
- [ ] Create "BrandBlock" with application icon and "AI Book converter" title.
- [ ] Create "CurrentBookSelector" for the selected book label.
- [ ] Create "ProfileMenuButton" with dropdown profile settings.
- [ ] Create a book workspace state that can render uploaded, processing, ready, and failed books.
- [ ] Implement empty states before a book is loaded.
- [ ] Add functional tests for the first screen, header layout, book processing URL, and themes.

#### Phase 3: Database Layer

- [ ] Configure TypeORM Data Mapper.
- [ ] Configure SQLite as the first driver.
- [ ] Create the "AnonymousSession" entity.
- [ ] Create the "User" entity.
- [ ] Create the "AuthIdentity" entity.
- [ ] Create the "Book" entity.
- [ ] Create the "BookMetadata" entity.
- [ ] Create the "UserBook" entity.
- [ ] Create the "SessionBook" entity.
- [ ] Add UUIDs for all session, user, identity, book, and link identifiers.
- [ ] Add a unique constraint for the "provider" and "providerSubject" identity pair.
- [ ] Add a unique constraint for the "userId" and "bookId" link.
- [ ] Add a unique constraint for the "sessionId" and "bookId" link.
- [ ] Add repositories without direct SQL access in services.

#### Phase 3A: Anonymous Sessions and Authentication

- [ ] Create "SessionService" for first-visit session creation and existing-session reuse.
- [ ] Resolve the current access context from server-controlled session/auth data.
- [ ] Add Google authentication start and callback routes.
- [ ] Add Facebook authentication start and callback routes.
- [ ] Add Telegram authentication start and callback routes.
- [ ] Create "AuthService" for external identity lookup and user creation.
- [ ] Create "AccountLinkingService" for linking anonymous session books to authenticated accounts.
- [ ] Preserve "SessionBook" records if account linking fails.
- [ ] Show a diagnostic message when account linking fails.
- [ ] Add tests for session creation, provider entry points, account linking, and authenticated history.

#### Phase 4: File Storage

- [ ] Add centralized configuration for `AI_BOOK_COVERTER_BOOKS_PATH`.
- [ ] Create "BookStorageService".
- [ ] Create `AI_BOOK_COVERTER_BOOKS_PATH/<book_id>` when a book is created.
- [ ] Save the source EPUB/DJVU in the book directory.
- [ ] Save cover and preview artifacts in the book directory.
- [ ] Save agent metadata JSON and table-of-contents JSON in the book directory.
- [ ] Protect file serving from arbitrary relative paths.
- [ ] Add tests for successful saving and unavailable-directory errors.

#### Phase 5: Book Upload and Metadata

- [ ] Implement EPUB and DJVU upload.
- [ ] Implement rejection of unsupported formats.
- [ ] Create a book record after successful upload.
- [ ] Return `bookId` and canonical `bookUrl` after successful upload.
- [ ] Update the browser address bar to the canonical book processing URL after successful upload.
- [ ] Create a link between the current anonymous session and the book.
- [ ] Create a link between the authenticated user and the book when the current access context is authenticated.
- [ ] Create "MetadataAgentService" with `@openai/agents`.
- [ ] Send the first three recognized pages to the metadata agent.
- [ ] Validate the metadata agent result: title, authors, ISBN numbers, language, cover subtitle, and cover image.
- [ ] Default metadata language to `en` when the agent does not detect a language.
- [ ] Save the metadata agent cover image through "BookStorageService".
- [ ] Read available book metadata.
- [ ] Show metadata in the UI.
- [ ] Implement metadata editing and saving.
- [ ] Implement cover display, missing-cover state, and cover replacement.

#### Phase 6: Book Preview

- [ ] Prepare an EPUB preview representation.
- [ ] Prepare a DJVU preview representation strategy.
- [ ] Create "MistralOcrService" with current Python live OCR behavior.
- [ ] Add stable page anchors to every recognized OCR page.
- [ ] Create "TableOfContentsAgentService" with `@openai/agents`.
- [ ] Send pages 3 through 10 to the table-of-contents agent.
- [ ] Store table-of-contents entries as links to page anchors.
- [ ] Render table-of-contents entries without raw page numbers as navigation targets.
- [ ] Implement "BookReader".
- [ ] Display text, images, tables, and footnotes.
- [ ] Show processing status.
- [ ] Restore processing status when a user opens a book processing URL before processing finishes.
- [ ] Restore editable metadata, cover controls, and preview when a user opens a book processing URL after processing finishes.
- [ ] Show safe not-found or access-denied state when the current session or user cannot access the book URL.
- [ ] Show a diagnostic message when preview preparation fails.

#### Phase 7: Converter Logic Port

- [ ] Port the book metadata model to TypeScript.
- [ ] Add ISBN numbers and cover subtitle to the web metadata model.
- [ ] Add page anchor fields to the web page model.
- [ ] Port the page model to TypeScript.
- [ ] Port the image model to TypeScript.
- [ ] Port the table model to TypeScript.
- [ ] Port the footnote model to TypeScript.
- [ ] Port the rules for removing headers and footers from the main text.
- [ ] Port saving images from base64.
- [ ] Port image and table placeholder replacement.
- [ ] Port endnotes construction.
- [ ] Port normalization of Python-like fenced code blocks.
- [ ] Add unit tests for Mistral OCR page anchor enrichment.
- [ ] Add unit tests for metadata agent result validation.
- [ ] Add unit tests for table-of-contents anchor output.
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
