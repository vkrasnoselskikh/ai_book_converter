# Design: AI Book Converter Web UI

## Overview

The web application is located in "apps/web-ui" and consists of a React TypeScript application, a Node.js TypeScript backend, React server-side rendering, and a TypeORM storage layer using the Data Mapper pattern. The first version uses SQLite, but the schema and repository layer must be prepared for replacing the driver with Postgres without rewriting domain logic.

The current Python logic from "src/ai_book_converter" is ported only where it is needed by the web application: book directory management, format validation, metadata extraction and editing, content normalization, image/table/footnote preservation, and HTML preparation for book preview. CLI behavior and Python-specific implementation details are not ported into "apps/web-ui".

## Frontend Architecture

"apps/web-ui" must use React with TSX and TypeScript. The UI is built as a single-page application with a server-rendered first screen and client hydration.

Main components:

- "AppShell" - the shared page layout, header bar, and footer.
- "BookUploadPanel" - EPUB and DJVU upload, submit state, and format errors.
- "BookMetadataPanel" - metadata display and editing.
- "BookCoverEditor" - current cover preview and replacement upload.
- "BookReader" - processed book content preview.
- "ProcessingStatus" - processing state and diagnostic messages.

Styling uses daisyUI version > "5.5.19" through CSS. The day theme must use "emerald", and the night theme must use "forest". Theme switching must be implemented through the theme attribute on the root HTML element or an equivalent daisyUI mechanism.

## Server Architecture

The backend is implemented with Node.js and TypeScript. It is responsible for:

- server-side rendering of the React first screen;
- book upload routes;
- metadata read and update routes;
- cover replacement routes;
- book preview data routes;
- database interaction;
- book file storage;
- running domain services for book processing.

Recommended server modules:

- "server.ts" - HTTP server startup.
- "ssr/renderApp.tsx" - React server-side rendering.
- "routes/bookRoutes.ts" - book routes.
- "routes/metadataRoutes.ts" - metadata routes.
- "routes/coverRoutes.ts" - cover routes.
- "config/appConfig.ts" - application configuration.
- "database/dataSource.ts" - TypeORM setup.
- "repositories/*Repository.ts" - Data Mapper repositories.
- "services/bookStorageService.ts" - book file storage.
- "services/bookProcessingService.ts" - book processing orchestration.
- "services/bookPreviewService.ts" - preview data preparation.

## Routing

Minimum HTTP route set:

- "GET /" - SSR home page.
- "POST /api/books" - upload EPUB or DJVU and create a book.
- "GET /api/books/:bookId" - get book, status, and metadata.
- "PATCH /api/books/:bookId/metadata" - update metadata.
- "PUT /api/books/:bookId/cover" - replace cover.
- "GET /api/books/:bookId/preview" - get prepared preview content.
- "GET /api/books/:bookId/files/:fileName" - serve allowed book files, such as covers or preview images.

Routes must return structured errors without exposing internal paths, secrets, or stack traces.

## Data Model

All identifiers are UUIDs.

### "User"

Fields:

- "id: uuid"
- "displayName: string"
- "createdAt: Date"
- "updatedAt: Date"

### "Book"

Fields:

- "id: uuid"
- "originalFileName: string"
- "sourceFormat: 'epub' | 'djvu'"
- "storagePath: string"
- "status: 'uploaded' | 'processing' | 'ready' | 'failed'"
- "statusMessage: string | null"
- "createdAt: Date"
- "updatedAt: Date"

### "BookMetadata"

Fields:

- "id: uuid"
- "bookId: uuid"
- "title: string"
- "authors: string[]"
- "language: string"
- "description: string | null"
- "coverPath: string | null"
- "toc: Json"
- "createdAt: Date"
- "updatedAt: Date"

For SQLite, arrays and JSON must be stored through compatible TypeORM transformers or JSON columns with future Postgres migration in mind.

### "UserBook"

Fields:

- "id: uuid"
- "userId: uuid"
- "bookId: uuid"
- "role: 'owner' | 'reader'"
- "createdAt: Date"

"UserBook" must have a unique constraint on the "userId" and "bookId" pair.

## Database Layer

TypeORM must use the Data Mapper pattern:

- entities describe table structure;
- repositories encapsulate queries;
- services must not access SQL directly;
- domain logic must not depend on SQLite-specific details.

SQLite is used as the first driver. Configuration must be centralized in "config/appConfig.ts" and "database/dataSource.ts" so that the driver and connection settings can later be replaced with Postgres.

## File Storage

Book processing files are stored in:

```text
AI_BOOK_COVERTER_BOOKS_PATH/<book_id>/
```

The environment variable name is kept as "AI_BOOK_COVERTER_BOOKS_PATH" because it is specified in the requirement. The value must be read centrally from backend configuration. If the variable is missing or the directory is unavailable, book processing must finish with a diagnostic error.

Recommended book directory structure:

```text
<book_id>/
  source/
    original.epub | original.djvu
  metadata/
    metadata.json
  cover/
    cover.<ext>
  preview/
    content.html
    pages.json
  images/
    <image files>
  processing/
    state.json
    warnings.json
    raw_payload.json
```

The backend must serve only allowed files from the specific book directory and must not accept arbitrary relative paths from the client.

## Book Processing Services

Logic from "src/ai_book_converter" is ported into TypeScript domain services:

- "BookInputValidator" - validates EPUB and DJVU according to the web requirements.
- "BookStorageService" - creates the book directory and saves artifacts.
- "MetadataExtractionService" - reads or prepares metadata and cover data.
- "ContentNormalizationService" - normalizes pages, blocks, tables, images, and warnings.
- "EndnoteService" - moves footer notes into readable form and preserves unmatched notes.
- "PreviewRenderService" - prepares HTML or structured preview data for "BookReader".

Portable rules from the current Python code:

- processing state and diagnostic warnings from "PipelineState";
- page structure from "PageContent";
- image structure from "PageImage";
- table structure from "PageTable";
- metadata structure from "BookMetadata";
- saving images from base64;
- removing headers and footers from the main text;
- normalizing fenced code blocks for Python-like code;
- moving footers into endnotes;
- replacing table and image placeholders before HTML rendering.

Python CLI rules, CLI temporary directories, and final EPUB publication are not mandatory for the first web screen unless a separate task requires them.

## EPUB and DJVU Handling

EPUB must be supported as a web application input format. Minimum behavior:

- save the source EPUB;
- read available metadata;
- extract or detect the cover when available;
- prepare an HTML representation for preview.

DJVU must be supported as a web application input format. Because the current Python implementation only validates DJVU and does not contain a full DJVU parser, the design must keep a separate processing branch:

- direct DJVU reading if the selected library supports the required data;
- or preliminary DJVU conversion into an intermediate format;
- or a diagnostic status if the specific file cannot be parsed in the current configuration.

The concrete EPUB/DJVU processing library must be selected during implementation after checking compatibility with Node.js and TypeScript.

## SSR Flow

1. The user requests "GET /".
2. The backend creates the initial page state.
3. "renderApp.tsx" generates HTML with the header bar, upload block, and footer.
4. Client React loads and hydrates the markup.
5. Subsequent actions run through the API without navigating to other pages.

SSR must not require a selected book. The first screen must remain available even when the database fails, if a diagnostic state can be returned.

## Error Handling

Errors are grouped as:

- file validation errors;
- file storage errors;
- EPUB/DJVU reading errors;
- database errors;
- SSR errors;
- client hydration errors;
- metadata or cover save errors.

Each error must have:

- a safe user-facing message;
- an internal diagnostic code;
- a backend log entry;
- a saved book status when the error belongs to a specific book.

## Testing Strategy

### Unit Tests

- `apps/web-ui/tests/unit/test_book_input_validator.ts` - verifies EPUB/DJVU support and rejection of other formats.
- `apps/web-ui/tests/unit/test_book_storage_service.ts` - verifies `AI_BOOK_COVERTER_BOOKS_PATH/<book_id>` and file saving.
- `apps/web-ui/tests/unit/test_entities.ts` - verifies UUIDs, links, and entity constraints.
- `apps/web-ui/tests/unit/test_metadata_service.ts` - verifies metadata reading and updating.
- `apps/web-ui/tests/unit/test_cover_service.ts` - verifies cover replacement.
- `apps/web-ui/tests/unit/test_content_normalization_service.ts` - verifies portable normalization rules.
- `apps/web-ui/tests/unit/test_endnote_service.ts` - verifies footnotes and unmatched footnotes.
- `apps/web-ui/tests/unit/test_preview_render_service.ts` - verifies HTML preview.
- `apps/web-ui/tests/unit/test_ssr.tsx` - verifies first-screen server-side rendering.

### Functional Tests

- `apps/web-ui/tests/functional/test_home_page.ts` - verifies the main SPA blocks.
- `apps/web-ui/tests/functional/test_theme_modes.ts` - verifies the "emerald" and "forest" themes.
- `apps/web-ui/tests/functional/test_book_upload.ts` - verifies EPUB/DJVU upload.
- `apps/web-ui/tests/functional/test_book_metadata.ts` - verifies metadata display and saving.
- `apps/web-ui/tests/functional/test_cover_editing.ts` - verifies cover replacement.
- `apps/web-ui/tests/functional/test_book_reader.ts` - verifies book preview.
- `apps/web-ui/tests/functional/test_user_books.ts` - verifies current-user book access.
- `apps/web-ui/tests/functional/test_shared_books.ts` - verifies linking one book to several users.
- `apps/web-ui/tests/functional/test_book_file_storage.ts` - verifies book artifact storage.
- `apps/web-ui/tests/functional/test_ssr_rendering.ts` - verifies first-screen HTML from the server.

### Requirements Coverage

| Requirement | Unit Tests | Functional Tests |
|-------------|------------|-------------------|
| web-ui.1 | `apps/web-ui/tests/unit/test_ssr.tsx` | `apps/web-ui/tests/functional/test_home_page.ts`, `apps/web-ui/tests/functional/test_theme_modes.ts` |
| web-ui.2 | `apps/web-ui/tests/unit/test_book_input_validator.ts` | `apps/web-ui/tests/functional/test_book_upload.ts`, `apps/web-ui/tests/functional/test_upload_validation.ts` |
| web-ui.3 | `apps/web-ui/tests/unit/test_metadata_service.ts`, `apps/web-ui/tests/unit/test_cover_service.ts` | `apps/web-ui/tests/functional/test_book_metadata.ts`, `apps/web-ui/tests/functional/test_cover_editing.ts` |
| web-ui.4 | `apps/web-ui/tests/unit/test_preview_render_service.ts`, `apps/web-ui/tests/unit/test_endnote_service.ts` | `apps/web-ui/tests/functional/test_book_reader.ts`, `apps/web-ui/tests/functional/test_book_processing_state.ts` |
| web-ui.5 | `apps/web-ui/tests/unit/test_entities.ts` | `apps/web-ui/tests/functional/test_user_books.ts`, `apps/web-ui/tests/functional/test_shared_books.ts` |
| web-ui.6 | `apps/web-ui/tests/unit/test_book_storage_service.ts` | `apps/web-ui/tests/functional/test_book_file_storage.ts`, `apps/web-ui/tests/functional/test_book_storage_error.ts` |
| web-ui.7 | `apps/web-ui/tests/unit/test_ssr.tsx` | `apps/web-ui/tests/functional/test_ssr_rendering.ts`, `apps/web-ui/tests/functional/test_client_hydration.ts` |
| web-ui.8 | `apps/web-ui/tests/unit/test_content_normalization_service.ts`, `apps/web-ui/tests/unit/test_endnote_service.ts`, `apps/web-ui/tests/unit/test_preview_render_service.ts` | `apps/web-ui/tests/functional/test_converter_port.ts`, `apps/web-ui/tests/functional/test_partial_book_data.ts` |
