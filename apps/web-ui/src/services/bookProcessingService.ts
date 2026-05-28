import fs from "fs";
import path from "path";
import { BookRepository } from "../database/repositories/BookRepository.js";
import { BookStorageService } from "./bookStorageService.js";
import { EpubExtractor } from "./epubExtractor.js";
import { DjvuConverter } from "./djvuConverter.js";
import { MistralOcrService } from "./mistralOcrService.js";
import { AgentService } from "./agentService.js";
import { NormalizationService } from "./normalizationService.js";
import { EndnoteService } from "./endnoteService.js";
import { PreviewRenderService } from "./previewRenderService.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("bookProcessingService");

export class BookProcessingService {
  private bookRepository: BookRepository;
  private storageService: BookStorageService;
  private ocrService: MistralOcrService;
  private agentService: AgentService;

  constructor() {
    this.bookRepository = new BookRepository();
    this.storageService = new BookStorageService();
    this.ocrService = new MistralOcrService();
    this.agentService = new AgentService();
  }

  // Trigger book processing in the background
  processBookInBackground(bookId: string, filePath: string): void {
    logger.info(`Starting background processing for bookId=${bookId}`);

    // We run it asynchronously in the background
    this.processBook(bookId, filePath)
      .then(() => {
        logger.info(`Successfully completed processing for bookId=${bookId}`);
      })
      .catch((err: any) => {
        logger.error(`Failed to process bookId=${bookId}:`, err);
        // Update database state to failed
        this.bookRepository
          .updateStatus(bookId, "failed", err.message)
          .catch((dbErr) =>
            logger.error("Failed to update status to failed in DB", dbErr),
          );
      });
  }

  // Core processing orchestration
  async processBook(bookId: string, filePath: string): Promise<void> {
    // 1. Update status to 'processing'
    await this.bookRepository.updateStatus(bookId, "processing");

    const book = await this.bookRepository.findById(bookId);
    if (!book) {
      throw new Error(`Book not found in database: ${bookId}`);
    }

    if (book.sourceFormat === "epub") {
      await this.processEpub(bookId, filePath);
    } else if (book.sourceFormat === "djvu") {
      await this.processDjvu(bookId, filePath);
    } else {
      throw new Error(`Unsupported source format: ${book.sourceFormat}`);
    }
  }

  private async processEpub(bookId: string, filePath: string): Promise<void> {
    logger.info(`Processing EPUB bookId=${bookId}`);

    // Extract metadata & content
    const epub = EpubExtractor.extract(filePath);

    // Save cover if available
    let coverPath = null;
    if (epub.coverBuffer) {
      const coverFileName = epub.coverPath
        ? path.basename(epub.coverPath)
        : "cover.png";
      this.storageService.writeFile(
        bookId,
        "cover",
        coverFileName,
        epub.coverBuffer,
      );
      coverPath = `cover/${coverFileName}`;
    }

    // Build concatenated XHTML body content for preview
    const bodyHtml = epub.pages
      .map((page) => {
        return `<section id="page-${page.id}">\n${page.content}\n</section>`;
      })
      .join("\n\n");

    const fullHtml = PreviewRenderService.renderBookHtml(bodyHtml, "");

    // Save preview artifacts
    this.storageService.writeFile(bookId, "preview", "content.html", fullHtml);
    this.storageService.writeFile(
      bookId,
      "preview",
      "pages.json",
      JSON.stringify(epub.pages),
    );

    const tocEntries = epub.pages.map((p) => ({
      title: p.title || "Section",
      level: 1,
      anchorId: `page-${p.id}`,
    }));

    this.storageService.writeFile(
      bookId,
      "preview",
      "toc.json",
      JSON.stringify(tocEntries),
    );

    // Save metadata record in DB
    await this.bookRepository.saveMetadata(bookId, {
      title: epub.title,
      authors: epub.authors,
      isbnNumbers: epub.isbnNumbers,
      language: epub.language,
      coverPath,
      toc: { entries: tocEntries },
    });

    // Update book status to ready
    await this.bookRepository.updateStatus(bookId, "ready");
  }

  private async processDjvu(bookId: string, filePath: string): Promise<void> {
    logger.info(`Processing DJVU bookId=${bookId}`);

    const bookDir = this.storageService.getBookDir(bookId);

    // Create source and cover subdirs
    this.storageService.ensureBookDir(bookId);
    const sourceDir = path.join(bookDir, "source");
    const coverDir = path.join(bookDir, "cover");
    if (!fs.existsSync(sourceDir)) fs.mkdirSync(sourceDir, { recursive: true });
    if (!fs.existsSync(coverDir)) fs.mkdirSync(coverDir, { recursive: true });

    const targetPdfPath = path.join(sourceDir, "converted.pdf");
    const targetCoverPath = path.join(coverDir, "cover.png");

    // 1. Convert DJVU to PDF
    logger.info("Converting DJVU to PDF...");
    DjvuConverter.convertToPdf(filePath, targetPdfPath);

    // 2. Extract cover image from first page
    logger.info("Extracting first page cover image...");
    try {
      DjvuConverter.extractPageImage(filePath, 1, targetCoverPath);
    } catch (coverErr) {
      logger.error(
        "DJVU Cover extraction failed (using placeholder fallback):",
        coverErr,
      );
    }

    // 3. Process PDF via Mistral OCR
    logger.info("Triggering Mistral OCR on converted PDF...");
    const ocrPages = await this.ocrService.processDocument(targetPdfPath);

    // 4. Save any extracted images to disk
    logger.info("Saving OCR-extracted page images...");
    for (const page of ocrPages) {
      for (const img of page.images) {
        if (img.imageBase64) {
          const imgBuffer = Buffer.from(
            img.imageBase64.split(",").pop() || "",
            "base64",
          );
          this.storageService.writeFile(bookId, "images", img.id, imgBuffer);
        }
      }
    }

    // 5. Extract metadata via AgentService
    logger.info("Running Metadata Agent...");
    const firstPagesText = ocrPages
      .slice(0, 3)
      .map((p) => p.markdown)
      .join("\n\n");
    const agentMetadata =
      await this.agentService.extractMetadata(firstPagesText);

    // 6. Extract Table of Contents via AgentService
    logger.info("Running Table of Contents Agent...");
    const tocAgentEntries = await this.agentService.extractTableOfContents(
      ocrPages
        .slice(2, 10)
        .map((p) => ({ pageNumber: p.pageNumber, text: p.markdown })),
    );

    // 7. Normalize pages, blocks, tables, images, and warnings
    logger.info("Normalizing OCR text and code blocks...");
    const normalizedPages = ocrPages.map((page) => {
      // Strip headers/footers
      let cleanMarkdown = NormalizationService.stripBoundaryBlocks(
        page.markdown,
        page.headers,
        page.footers,
      );
      // Re-indent Python-like code blocks
      cleanMarkdown = NormalizationService.normalizeCodeBlocks(cleanMarkdown);

      return {
        ...page,
        markdown: cleanMarkdown,
      };
    });

    // 8. Build endnotes and rewrite body text
    logger.info("Linking footnotes and constructing endnotes...");
    const { rewrittenPages, endnotes } =
      EndnoteService.buildEndnotes(normalizedPages);

    // 9. Prepare preview representation
    logger.info("Compiling preview markdown to HTML sections...");
    const imagePrefix = `/api/books/${bookId}/files/images`; // serve from server API
    const bodyHtml = PreviewRenderService.renderBodySections(
      rewrittenPages,
      imagePrefix,
    );
    const endnotesHtml = PreviewRenderService.renderEndnotesHtml(endnotes);
    const fullHtml = PreviewRenderService.renderBookHtml(
      bodyHtml,
      endnotesHtml,
    );

    // Save final artifacts
    this.storageService.writeFile(bookId, "preview", "content.html", fullHtml);
    this.storageService.writeFile(
      bookId,
      "preview",
      "pages.json",
      JSON.stringify(rewrittenPages),
    );
    this.storageService.writeFile(
      bookId,
      "preview",
      "toc.json",
      JSON.stringify(tocAgentEntries),
    );

    // Save metadata record in DB
    const finalCoverPath = fs.existsSync(targetCoverPath)
      ? "cover/cover.png"
      : null;
    await this.bookRepository.saveMetadata(bookId, {
      title: agentMetadata.title,
      authors: agentMetadata.authors,
      isbnNumbers: agentMetadata.isbn_numbers,
      language: agentMetadata.language || "en",
      coverSubtitle: agentMetadata.cover_subtitle,
      coverPath: finalCoverPath,
      toc: { entries: tocAgentEntries },
    });

    // Update book status to ready
    await this.bookRepository.updateStatus(bookId, "ready");
  }
}
