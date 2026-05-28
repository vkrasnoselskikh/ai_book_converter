# Task List: AI Book Converter Web UI

## Overview

This specification describes the implementation of "apps/web-ui": React TSX frontend, Node.js TypeScript backend, SSR, TypeORM Data Mapper, SQLite, and a TypeScript port of selected current converter logic.

**Current status:** Completed

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
- ✅ The "AI Book Converter Web UI" specification has been reviewed, interactive grill-me interview completed, and implementation plan approved.
- ✅ Phase 1 Scaffolding: Created `apps/web-ui` with custom `package.json`, TS config, Vite config, root `index.html` shell, and `src/index.css` Tailwind CSS & daisyUI 5 configuration.
- ✅ Phase 2 Database Layer: Configured TypeORM SQLite DataSource, designed the 7 core entities with portability traits (simple-json/simple-array), and created encapsulated query repositories (BookRepository, SessionRepository, UserRepository).
- ✅ Phase 3 Domain & Backend Services: Configured BookStorageService, EpubExtractor, DjvuConverter, MistralOcrService, AgentService, NormalizationService, EndnoteService, and PreviewRenderService.
- ✅ Phase 4 Express Server and Custom SSR: Implemented Express server, REST endpoints, cookie parsing, Vite HMR, and server-rendered initial state rendering.
- ✅ Phase 5 React Components & SPA Widgets: Implemented AppShell, ThemeContext Emerald/Forest Day/Night toggles, HeaderBar selector, responsive BookUploadPanel, collapsible BookReader sidebar, and metadata/cover editors.
- ✅ Phase 6 Unit Testing: Wrote full Vitest test suite in `apps/web-ui/tests/unit/services.test.ts`.
- ✅ Phase 8 Validation and Hardening: Verified implementation matches requirements and design, fixed image markdown rendering bugs, fixed TypeScript compilation/unused variable errors, resolved logging library issues, ran full project-wide checks (Ruff, Pytest, Vite/TSC typecheck, and Vitest), ensuring 100% of validation passes.

### In Progress

- None

### Planned

All phases and tasks are successfully completed.
