# Design: AI Book Converter Web UI

## Overview

The web application is located in "apps/web-ui" and consists of a React TypeScript application, a Node.js TypeScript backend, React server-side rendering, and a TypeORM storage layer using the Data Mapper pattern. The first version uses SQLite through the "better-sqlite3" TypeORM driver, but the schema and repository layer must be prepared for replacing the driver with Postgres without rewriting domain logic.


## Frontend Architecture

"apps/web-ui" must use React with TSX and TypeScript. The UI is built as a single-page application with a server-rendered first screen and client hydration.

Main components:

- "AppShell" - the shared page layout, header bar, and footer.
- "HeaderBar" - the top application header with left and right layout areas.
- "BrandBlock" - application icon and "AI Book converter" title.
- "CurrentBookSelector" - current book selector block, for example "Book: Andrey Karpathy - AI Agents".
- "ProfileMenuButton" - profile icon button and dropdown menu for profile settings.
- "BookUploadPanel" - EPUB and DJVU upload, submit state, and format errors.
- "BookMetadataPanel" - metadata display and editing.
- "BookCoverEditor" - current cover preview and replacement upload.
- "BookReader" - processed book content preview rendered through "ReactMarkdown" for Mistral OCR markdown pages, with a legacy HTML fallback for EPUB preview content. It applies article-level daisyUI/Tailwind styling for headings, links, lists, code blocks, tables, quotes, images, and endnotes.
- "ProcessingStatus" - processing state and diagnostic messages.

Styling uses daisyUI version > "5.5.19" through CSS. The day theme must use "emerald", and the night theme must use "forest". Theme switching must be implemented through the theme attribute on the root HTML element or an equivalent daisyUI mechanism.

The header layout must have three visual blocks:

- left brand block with icon and "AI Book converter";
- left current book selector block showing the selected book label;
- right profile icon button.

The profile icon button must open a dropdown menu for profile settings. The header must keep stable spacing when the current book is absent, processing, failed, or ready.

## Server Architecture

The backend is implemented with Node.js and TypeScript. It is responsible for:

- server-side rendering of the React first screen;
- anonymous session creation and lookup;
- external authentication callback handling;
- linking anonymous session work to authenticated accounts;
- book upload routes;
- metadata read and update routes;
- cover replacement routes;
- book preview data routes;
- database interaction;
- book file storage;
- running domain services for book processing.

The HTTP server must handle "SIGINT" and "SIGTERM" by closing the Express listener, the development "ViteDevServer" instance when present, and the initialized TypeORM data source before process exit.

Recommended server modules:

- "server.ts" - HTTP server startup.
- "ssr/renderApp.tsx" - React server-side rendering.
- "routes/bookRoutes.ts" - book routes.
- "routes/authRoutes.ts" - Google, Facebook, and Telegram authentication routes.
- "routes/sessionRoutes.ts" - current session state routes when needed by the client.
- "routes/metadataRoutes.ts" - metadata routes.
- "routes/coverRoutes.ts" - cover routes.
- "config/appConfig.ts" - application configuration.
- "database/dataSource.ts" - TypeORM setup using the "better-sqlite3" driver for the local SQLite database.
- "repositories/*Repository.ts" - Data Mapper repositories.
- "services/sessionService.ts" - anonymous session creation and validation.
- "services/authService.ts" - external identity resolution and account creation.
- "services/accountLinkingService.ts" - anonymous session to account merge.
- "services/bookStorageService.ts" - book file storage.
- "services/bookProcessingService.ts" - book processing orchestration.
- "services/mistralOcrService.ts" - Mistral OCR request and page anchor enrichment.
- "services/metadataAgentService.ts" - metadata extraction agent based on the first three pages.
- "services/tableOfContentsAgentService.ts" - table of contents agent based on the first 20 pages.
- "services/bookPreviewService.ts" - preview data preparation.

## Routing

Minimum HTTP route set:

- "GET /" - SSR home page.
- "GET /books/:bookId" - SSR book workspace for upload processing, processing status, metadata editing, cover editing, and preview.
- "GET /api/session" - return the current anonymous or authenticated access context.
- "GET /api/auth/google/start" - start Google authentication when configured.
- "GET /api/auth/google/callback" - handle Google authentication callback when configured.
- "GET /api/auth/facebook/start" - start Facebook authentication when configured.
- "GET /api/auth/facebook/callback" - handle Facebook authentication callback when configured.
- "GET /api/auth/telegram/start" - start Telegram authentication when configured.
- "GET /api/auth/telegram/callback" - handle Telegram authentication callback when configured.
- "POST /api/books" - upload EPUB or DJVU and create a book.
- "GET /api/books/:bookId" - get book, status, and metadata.
- "PATCH /api/books/:bookId/metadata" - update metadata.
- "PUT /api/books/:bookId/cover" - replace cover.
- "GET /api/books/:bookId/preview" - get prepared preview content, including structured markdown pages for OCR books and legacy HTML content for fallback rendering.
- "GET /api/books/:bookId/files/:fileName" - serve allowed book files, such as covers or preview images.

Routes must return structured errors without exposing internal paths, secrets, or stack traces.

The canonical book processing URL must use the "GET /books/:bookId" route. After "POST /api/books" succeeds, the API response must include the created "bookId" and "bookUrl"; the hydrated client must update the address bar to "bookUrl" without waiting for background processing to finish.

## Data Model

All identifiers are UUIDs.

### "AnonymousSession"

Fields:

- "id: uuid"
- "mergedIntoUserId: uuid | null"
- "createdAt: Date"
- "lastSeenAt: Date"
- "expiresAt: Date | null"

The anonymous session identifier is issued before authentication and must be persisted in a secure HTTP-only session cookie or an equivalent server-controlled mechanism. A session that has been merged into a user account must remain resolvable long enough to avoid losing in-flight browser actions.

### "User"

Fields:

- "id: uuid"
- "displayName: string | null"
- "createdAt: Date"
- "updatedAt: Date"

### "AuthIdentity"

Fields:

- "id: uuid"
- "userId: uuid"
- "provider: 'google' | 'facebook' | 'telegram'"
- "providerSubject: string"
- "displayName: string | null"
- "createdAt: Date"
- "updatedAt: Date"

"AuthIdentity" must have a unique constraint on the "provider" and "providerSubject" pair.

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
- "isbnNumbers: string[]"
- "description: string | null"
- "coverSubtitle: string | null"
- "coverPath: string | null"
- "toc: Json"
- "createdAt: Date"
- "updatedAt: Date"

For SQLite, arrays and JSON must be stored through compatible TypeORM transformers or JSON columns with future Postgres migration in mind.

### "PageAnchor"

Fields:

- "bookId: uuid"
- "pageNumber: number"
- "anchorId: string"

Page anchors may be stored in preview JSON rather than a separate table if repository queries do not need to address anchors independently. The anchor format must be stable and based on the original one-based page number, for example "page-3".

### "UserBook"

Fields:

- "id: uuid"
- "userId: uuid"
- "bookId: uuid"
- "role: 'owner' | 'reader'"
- "createdAt: Date"

"UserBook" must have a unique constraint on the "userId" and "bookId" pair.

### "SessionBook"

Fields:

- "id: uuid"
- "sessionId: uuid"
- "bookId: uuid"
- "role: 'owner' | 'reader'"
- "createdAt: Date"

"SessionBook" must have a unique constraint on the "sessionId" and "bookId" pair.

## Database Layer

TypeORM must use the Data Mapper pattern:

- entities describe table structure;
- repositories encapsulate queries;
- services must not access SQL directly;
- domain logic must not depend on SQLite-specific details.

SQLite is used as the first driver. Configuration must be centralized in "config/appConfig.ts" and "database/dataSource.ts" so that the driver and connection settings can later be replaced with Postgres.

Anonymous access and authenticated access must be represented by explicit repository operations. Services must not infer access by trusting a client-provided user identifier. For anonymous requests, repositories must resolve available books through "SessionBook". For authenticated requests, repositories must resolve available books through "UserBook".

External authentication identities must be stored separately from "User" records so that one user account can later support several providers without changing the ownership model.

## Session and Authentication Flow

Anonymous-first flow:

1. The user requests "GET /".
2. The backend creates an "AnonymousSession" if the request does not already contain a valid session.
3. The backend returns the first screen with the session context available to client hydration.
4. Book upload, metadata editing, cover editing, and preview requests use the server-resolved anonymous session while the user is not authenticated.
5. New books are linked through "SessionBook".

Authentication flow:

1. The user initiates authentication on the frontend via mock login buttons (Google, Facebook, or Telegram). This mock flow simplifies local development and testing, with keys and environment configuration structure prepared for real OAuth providers in the future.
2. The server receives the mock authentication request, resolves a mock subject and display name (or generates a new one if not existing), and passes it to the domain layer.
3. "AuthService" finds an existing "AuthIdentity" by provider and subject or creates a new "User" and "AuthIdentity".
4. "AccountLinkingService" links all current "SessionBook" records to the resolved "User" by creating missing "UserBook" records.
5. Duplicate "UserBook" records are ignored through the unique "userId" and "bookId" constraint.
6. The authenticated user's book history is read through "UserBook".
7. If account linking fails, the original "SessionBook" records remain intact and the user sees a diagnostic message.


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
    original.pdf | original.djvu
  metadata/
    metadata.json
  cover/
    cover.<ext>
  preview/
    content.html
    pages.json
    toc.json
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
- "MistralOcrService" - sends the source document to Mistral OCR with the current Js live OCR behavior and adds page anchors to every recognized page.
- "MetadataAgentService" - runs the metadata extraction agent through "@openai/agents".
- "TableOfContentsAgentService" - runs the table-of-contents extraction agent through "@openai/agents".
- "MetadataExtractionService" - reads or prepares metadata and cover data.
- "ContentNormalizationService" - normalizes pages, blocks, tables, images, and warnings.
- "EndnoteService" - moves footer notes into readable form and preserves unmatched notes.
- "PreviewRenderService" - prepares structured markdown preview data for "BookReader" and keeps legacy HTML compilation for EPUB packaging and fallback preview rendering.


## OCR and LLM Extraction Flow

Mistral OCR flow:

1. "MistralOcrService" uploads the source PDF or DJVU-derived document to Mistral using the TypeScript implementation of the current JS live OCR behavior.
2. The OCR request must include image base64 extraction, table HTML extraction, header extraction, and footer extraction where supported by the selected Mistral OCR client.
3. The service normalizes every OCR page into an internal page object with both zero-based "pageIndex" and one-based "pageNumber".
4. The service assigns "anchorId" to every page using the stable "page-<pageNumber>" format.
5. Preview rendering returns each OCR page as a structured markdown page with an anchor identifier so "BookReader" can render it through "ReactMarkdown" while preserving original page targets.
6. "MistralOcrService" normalizes OCR images with stable "fileName" and "mimeType" fields derived from the image identifier and base64 data URI.
7. "BookProcessingService" saves OCR images using their normalized "fileName"; preview and EPUB rendering use the same filename without adding a second extension.
8. "CoverExtractionService" renders the first document page as "cover/cover.png" for PDF inputs and delegates DJVU first-page extraction to "DjvuConverter".
9. If first-page rendering is unavailable, cover fallback order is: first OCR image on page 1, non-placeholder metadata-agent cover image, then no cover.
10. "MistralOcrService" accepts both raw snake_case OCR fields and Mistral SDK camelCase OCR fields, including "image_base64"/"imageBase64" and image bounding-box coordinates.
11. OCR requests set "includeImageBase64" and a high "imageLimit" so image payloads are returned for image-heavy books where supported by the provider.

Metadata agent flow:

1. "MetadataAgentService" uses "@openai/agents" for agent orchestration.
2. The agent client is configured using the OpenAI client wrapper inside the `@openai/agents` SDK, pointing the `baseURL` to Mistral's API endpoint (`https://api.mistral.ai/v1`) and passing the `MISTRAL_API_KEY` to run Mistral models natively.
3. The agent receives only the first three recognized book pages as input.
4. The agent returns a structured "BookMetadataAgentResult" object:

```ts
type BookMetadataAgentResult = {
  title: string;
  authors: string[];
  isbn_numbers: string[];
  language: string;
  cover_subtitle: string | null;
  cover_image: string;
};
```

The "language" field defaults to "en" when the agent cannot detect a language. The "cover_image" field contains a base64 image payload. "MetadataExtractionService" must save this image through "BookStorageService" and store the resulting path in "BookMetadata.coverPath"; it must not keep large base64 image data as the primary persisted cover reference.

Table-of-contents agent flow:

1. "TableOfContentsAgentService" uses "@openai/agents" for agent orchestration.
2. The agent client is configured using the OpenAI client wrapper inside the `@openai/agents` SDK, pointing the `baseURL` to Mistral's API endpoint (`https://api.mistral.ai/v1`) and passing the `MISTRAL_API_KEY` to run Mistral models natively.
3. The agent receives the first 20 recognized pages as input, using original one-based page numbers.
4. The agent treats the first 20 pages only as source pages for reading the printed table of contents and distinguishes those source page labels from target page numbers printed in the table-of-contents text.
5. The agent returns structured entries with section title, nesting level, target "pageNumber", and "anchorId" derived from that target page number, plus the source page range where the printed table of contents starts and ends.
6. "AgentService" normalizes agent output so target "pageNumber" takes precedence over any conflicting "anchorId"; for example, a TOC line found on source page 4 that points to printed page 24 becomes "page-24".
7. The agent must not return raw page numbers as user-facing navigation targets.
8. "BookProcessingService" removes only pages in the detected table-of-contents source page range before endnote construction and preview rendering. If the range is invalid or absent, the original OCR pages are kept.
9. Page anchors remain the original one-based OCR anchors and are not renumbered after table-of-contents pages are removed.
10. "BookPreviewService" renders the table of contents as hyperlinks to page anchors.
11. "BookProcessingService" validates table-of-contents anchors against the remaining recognized one-based page anchors and falls back to the nearest available page anchor when needed.
12. EPUB download navigation maps "page-1" to the first generated OCR XHTML page, preserving the one-based preview anchor contract.

The table-of-contents extraction result has this shape:

```ts
{
  entries: TocAgentEntry[];
  tocStartPageNumber: number | null;
  tocEndPageNumber: number | null;
}
```

The integration utilizes the OpenAI-compatible model invocation protocol, avoiding custom adapter wrappers while cleanly encapsulating prompt construction and output validation in their respective services.

## EPUB and DJVU Handling

EPUB must be supported as a web application input format. Minimum behavior:

- save the source EPUB;
- read available metadata;
- extract or detect the cover when available;
- prepare an HTML representation for preview.

EPUB parsing is implemented manually: the backend unzips the file using `adm-zip`, parses the OPF XML document using `fast-xml-parser` to extract metadata and cover images, and serves XHTML content directly for preview. This manual extraction approach ensures maximum stability without native library dependency compilation issues.

DJVU must be supported as a web application input format. Because the current Python implementation only validates DJVU and does not contain a full DJVU parser, the design uses a dual-branch processing approach:

- Try to convert/extract pages using external CLI tools (like `ddjvu` from `djvulibre` or `graphicsmagick`) if available on the host system.
- If the required binaries are not installed, fail gracefully with a clean user-facing diagnostic error indicating that `djvulibre` is missing.
- Ensure the entire pipeline is fully testable using mock/fixture data in the test environment so that tests pass regardless of host binary installations.


## SSR Flow

1. The user requests "GET /".
2. The backend resolves or creates the anonymous session and creates the initial page state.
3. "renderApp.tsx" generates HTML with the header bar, upload block, and footer.
4. Client React loads and hydrates the markup.
5. Subsequent actions run through the API without navigating to other pages.

SSR must not require a selected book. The first screen must remain available even when the database fails, if a diagnostic state can be returned.

Book URL flow:

1. The user uploads a supported book through "POST /api/books".
2. The backend creates the "Book" record, creates the current access link, starts or schedules processing, and returns "bookUrl".
3. The client updates browser history to "bookUrl" immediately after upload success.
4. If the user leaves the tab before processing completes, processing continues independently from the browser tab lifecycle.
5. When the user later opens "GET /books/:bookId", the backend resolves the current anonymous session or authenticated user and verifies access through "SessionBook" or "UserBook".
6. If the book is still processing, the book workspace shows the processing state and continues polling or subscribing through API calls.
7. If the book is ready, the book workspace shows editable metadata, cover controls, and preview.
8. If the book is failed, the book workspace shows the saved diagnostic status and keeps available editable data visible where possible.

## Error Handling

Errors are grouped as:

- file validation errors;
- file storage errors;
- EPUB/DJVU reading errors;
- database errors;
- session creation or lookup errors;
- external authentication errors;
- session-to-account linking errors;
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
- `apps/web-ui/tests/unit/test_entities.ts` - verifies UUIDs, sessions, identities, links, and entity constraints.
- `apps/web-ui/tests/unit/test_session_service.ts` - verifies anonymous session creation and reuse.
- `apps/web-ui/tests/unit/test_auth_service.ts` - verifies external identity lookup and user creation.
- `apps/web-ui/tests/unit/test_account_linking_service.ts` - verifies session books are linked to new and existing accounts.
- `apps/web-ui/tests/unit/test_mistral_ocr_service.ts` - verifies OCR payload normalization and page anchor creation.
- `apps/web-ui/tests/unit/test_metadata_agent_service.ts` - verifies first-three-pages metadata extraction and result validation.
- `apps/web-ui/tests/unit/test_table_of_contents_agent_service.ts` - verifies the first 20 pages produce anchor-based entries and a table-of-contents page range.
- `apps/web-ui/tests/unit/test_metadata_service.ts` - verifies metadata reading and updating.
- `apps/web-ui/tests/unit/test_cover_service.ts` - verifies cover replacement.
- `apps/web-ui/tests/unit/test_content_normalization_service.ts` - verifies portable normalization rules.
- `apps/web-ui/tests/unit/test_endnote_service.ts` - verifies footnotes and unmatched footnotes.
- `apps/web-ui/tests/unit/test_preview_render_service.ts` - verifies structured markdown preview preparation and legacy HTML preview.
- `apps/web-ui/tests/unit/services.test.ts` - verifies TOC anchor normalization by target page numbers read from the table-of-contents text.
- `apps/web-ui/tests/unit/test_ssr.tsx` - verifies first-screen server-side rendering.
- `apps/web-ui/tests/unit/test_book_url_builder.ts` - verifies canonical book processing URLs.
- `apps/web-ui/tests/unit/test_header_state.tsx` - verifies header state for empty and selected books.

### Functional Tests

- `apps/web-ui/tests/functional/test_home_page.ts` - verifies the main SPA blocks.
- `apps/web-ui/tests/functional/test_header_layout.ts` - verifies the header brand, current book selector, and profile dropdown.
- `apps/web-ui/tests/functional/test_theme_modes.ts` - verifies the "emerald" and "forest" themes.
- `apps/web-ui/tests/functional/test_anonymous_session.ts` - verifies first-visit session creation and reuse.
- `apps/web-ui/tests/functional/test_book_upload.ts` - verifies EPUB/DJVU upload.
- `apps/web-ui/tests/functional/test_book_processing_url.ts` - verifies address bar update after upload.
- `apps/web-ui/tests/functional/test_book_processing_resume.ts` - verifies returning to a book processing URL restores status or editing.
- `apps/web-ui/tests/functional/test_book_metadata.ts` - verifies metadata display and saving.
- `apps/web-ui/tests/functional/test_metadata_agent.ts` - verifies metadata agent extraction from the first three pages.
- `apps/web-ui/tests/functional/test_cover_editing.ts` - verifies cover replacement.
- `apps/web-ui/tests/functional/test_book_reader.ts` - verifies book preview.
- `apps/web-ui/tests/functional/test_ocr_page_anchors.ts` - verifies OCR pages receive preview anchors.
- `apps/web-ui/tests/functional/test_table_of_contents.ts` - verifies table of contents links to page anchors.
- `apps/web-ui/tests/functional/test_toc_agent.ts` - verifies table of contents extraction from the first 20 pages and removal of detected table-of-contents pages.
- `apps/web-ui/tests/functional/test_anonymous_books.ts` - verifies current anonymous session book access.
- `apps/web-ui/tests/functional/test_user_books.ts` - verifies authenticated user book access.
- `apps/web-ui/tests/functional/test_shared_books.ts` - verifies linking one book to several users.
- `apps/web-ui/tests/functional/test_auth_providers.ts` - verifies Google, Facebook, and Telegram authentication entry points when configured.
- `apps/web-ui/tests/functional/test_session_account_linking.ts` - verifies linking anonymous books to a new or existing user after authentication.
- `apps/web-ui/tests/functional/test_authenticated_history.ts` - verifies authenticated processing history.
- `apps/web-ui/tests/functional/test_book_file_storage.ts` - verifies book artifact storage.
- `apps/web-ui/tests/functional/test_ssr_rendering.ts` - verifies first-screen HTML from the server.
- `apps/web-ui/tests/functional/test_book_url_ssr.ts` - verifies server-rendered book workspace from a processing URL.

### Requirements Coverage

| Requirement | Unit Tests | Functional Tests |
|-------------|------------|-------------------|
| web-ui.1 | `apps/web-ui/tests/unit/test_ssr.tsx`, `apps/web-ui/tests/unit/test_session_service.ts`, `apps/web-ui/tests/unit/test_header_state.tsx` | `apps/web-ui/tests/functional/test_home_page.ts`, `apps/web-ui/tests/functional/test_header_layout.ts`, `apps/web-ui/tests/functional/test_theme_modes.ts`, `apps/web-ui/tests/functional/test_anonymous_session.ts` |
| web-ui.2 | `apps/web-ui/tests/unit/test_book_input_validator.ts`, `apps/web-ui/tests/unit/test_book_url_builder.ts` | `apps/web-ui/tests/functional/test_book_upload.ts`, `apps/web-ui/tests/functional/test_upload_validation.ts`, `apps/web-ui/tests/functional/test_book_processing_url.ts` |
| web-ui.3 | `apps/web-ui/tests/unit/test_metadata_service.ts`, `apps/web-ui/tests/unit/test_metadata_agent_service.ts`, `apps/web-ui/tests/unit/test_cover_service.ts`, `apps/web-ui/tests/unit/services.test.ts` | `apps/web-ui/tests/functional/test_book_metadata.ts`, `apps/web-ui/tests/functional/test_metadata_agent.ts`, `apps/web-ui/tests/functional/test_cover_editing.ts` |
| web-ui.4 | `apps/web-ui/tests/unit/test_preview_render_service.ts`, `apps/web-ui/tests/unit/test_endnote_service.ts`, `apps/web-ui/tests/unit/test_table_of_contents_agent_service.ts`, `apps/web-ui/tests/unit/services.test.ts` | `apps/web-ui/tests/functional/test_book_reader.ts`, `apps/web-ui/tests/functional/test_book_processing_state.ts`, `apps/web-ui/tests/functional/test_table_of_contents.ts`, `apps/web-ui/tests/functional/test_book_processing_resume.ts` |
| web-ui.5 | `apps/web-ui/tests/unit/test_entities.ts`, `apps/web-ui/tests/unit/test_session_service.ts` | `apps/web-ui/tests/functional/test_anonymous_books.ts`, `apps/web-ui/tests/functional/test_user_books.ts`, `apps/web-ui/tests/functional/test_shared_books.ts` |
| web-ui.6 | `apps/web-ui/tests/unit/test_book_storage_service.ts` | `apps/web-ui/tests/functional/test_book_file_storage.ts`, `apps/web-ui/tests/functional/test_book_storage_error.ts` |
| web-ui.7 | `apps/web-ui/tests/unit/test_ssr.tsx`, `apps/web-ui/tests/unit/test_book_url_builder.ts` | `apps/web-ui/tests/functional/test_ssr_rendering.ts`, `apps/web-ui/tests/functional/test_client_hydration.ts`, `apps/web-ui/tests/functional/test_book_url_ssr.ts` |
| web-ui.8 | `apps/web-ui/tests/unit/test_mistral_ocr_service.ts`, `apps/web-ui/tests/unit/test_content_normalization_service.ts`, `apps/web-ui/tests/unit/test_endnote_service.ts`, `apps/web-ui/tests/unit/test_preview_render_service.ts`, `apps/web-ui/tests/unit/test_table_of_contents_agent_service.ts`, `apps/web-ui/tests/unit/services.test.ts` | `apps/web-ui/tests/functional/test_converter_port.ts`, `apps/web-ui/tests/functional/test_partial_book_data.ts`, `apps/web-ui/tests/functional/test_ocr_page_anchors.ts`, `apps/web-ui/tests/functional/test_toc_agent.ts` |
| web-ui.9 | `apps/web-ui/tests/unit/test_auth_service.ts`, `apps/web-ui/tests/unit/test_account_linking_service.ts` | `apps/web-ui/tests/functional/test_auth_providers.ts`, `apps/web-ui/tests/functional/test_session_account_linking.ts`, `apps/web-ui/tests/functional/test_authenticated_history.ts` |
