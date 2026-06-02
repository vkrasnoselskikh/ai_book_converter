import { describe, it, expect, vi, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { EpubExtractor } from "../../src/services/epubExtractor.js";
import { DjvuConverter } from "../../src/services/djvuConverter.js";
import { MistralOcrService } from "../../src/services/mistralOcrService.js";
import { AgentService } from "../../src/services/agentService.js";
import { NormalizationService } from "../../src/services/normalizationService.js";
import { EndnoteService } from "../../src/services/endnoteService.js";
import { PreviewRenderService } from "../../src/services/previewRenderService.js";
import { AuthService } from "../../src/services/authService.js";
import { CoverExtractionService } from "../../src/services/coverExtractionService.js";
import { EpubPackager } from "../../src/services/epubPackager.js";
import { initializeDatabase } from "../../src/database/dataSource.js";
import AdmZip from "adm-zip";

describe("AI Book Converter Web-UI Domain Services", () => {
  
  beforeAll(async () => {
    // Set mock env for DB initialize
    process.env.DATABASE_PATH = ":memory:";
    process.env.NODE_ENV = "test";
    await initializeDatabase();
  });

  // 1. EPUB Extractor Tests
  describe("EpubExtractor", () => {
    it("should fail gracefully when file does not exist", () => {
      expect(() => EpubExtractor.extract("non_existent_file.epub")).toThrow();
    });
  });

  // 2. DJVU Converter Tests
  describe("DjvuConverter", () => {
    it("should write a dummy PDF in mock test mode", () => {
      const tempPdf = "temp_mock_book.pdf";
      DjvuConverter.convertToPdf("dummy.djvu", tempPdf);
      expect(fs.existsSync(tempPdf)).toBe(true);
      const content = fs.readFileSync(tempPdf, "utf-8");
      expect(content).toContain("%PDF-1.4 mock pdf");
      fs.unlinkSync(tempPdf);
    });

    it("should write a dummy PNG page image in mock test mode", () => {
      const tempPng = "temp_mock_page.png";
      DjvuConverter.extractPageImage("dummy.djvu", 1, tempPng);
      expect(fs.existsSync(tempPng)).toBe(true);
      const content = fs.readFileSync(tempPng, "utf-8");
      expect(content).toBe("mock png data");
      fs.unlinkSync(tempPng);
    });
  });

  // 3. Mistral OCR Service Tests
  describe("MistralOcrService", () => {
    it("should normalize raw OCR response and assign stable page anchors", async () => {
      const ocrService = new MistralOcrService();
      const mockRawResponse = {
        pages: [
          {
            index: 0,
            markdown: "Page 1 Content",
            images: [
              {
                id: "img/cover",
                image_base64: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
              }
            ],
            headers: ["Header Block"],
            footers: ["Footer Block"]
          }
        ]
      };

      const normalized = ocrService.normalizeOcrResponse(mockRawResponse);
      expect(normalized).toHaveLength(1);
      expect(normalized[0].pageIndex).toBe(0);
      expect(normalized[0].pageNumber).toBe(1);
      expect(normalized[0].anchorId).toBe("page-1");
      expect(normalized[0].markdown).toBe("Page 1 Content");
      expect(normalized[0].headers).toContain("Header Block");
      expect(normalized[0].footers).toContain("Footer Block");
      expect(normalized[0].images[0].id).toBe("img/cover");
      expect(normalized[0].images[0].mimeType).toBe("image/jpeg");
      expect(normalized[0].images[0].fileName).toBe("img_cover.jpg");
    });

    it("should normalize live Mistral SDK OCR image fields", async () => {
      const ocrService = new MistralOcrService();
      const mockSdkResponse = {
        pages: [
          {
            index: 0,
            markdown: "Page image ![img-0.jpeg](img-0.jpeg)",
            images: [
              {
                id: "img-0.jpeg",
                topLeftX: 12,
                topLeftY: 20,
                bottomRightX: 212,
                bottomRightY: 170,
                imageBase64: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
              }
            ],
            tables: [],
            headers: [],
            footers: []
          }
        ]
      };

      const normalized = ocrService.normalizeOcrResponse(mockSdkResponse);

      expect(normalized[0].images[0].id).toBe("img-0.jpeg");
      expect(normalized[0].images[0].fileName).toBe("img-0.jpeg");
      expect(normalized[0].images[0].mimeType).toBe("image/jpeg");
      expect(normalized[0].images[0].imageBase64).toContain("data:image/jpeg;base64,");
      expect(normalized[0].images[0].width).toBe(200);
      expect(normalized[0].images[0].height).toBe(150);
    });
  });

  // 4. Agent Service Tests
  describe("AgentService", () => {
    it("should return mock metadata under test environments", async () => {
      const agentService = new AgentService();
      const meta = await agentService.extractMetadata("sample page text");
      expect(meta.title).toContain("Premium Artificial Intelligence");
      expect(meta.authors).toContain("Andrey Karpathy");
      expect(meta.isbn_numbers).toContain("ISBN 978-3-16-148410-0");
      expect(meta.language).toBe("en");
    });

    it("should return mock TOC under test environments", async () => {
      const agentService = new AgentService();
      const toc = await agentService.extractTableOfContents([{ pageNumber: 3, text: "Sample" }]);
      expect(toc).toHaveLength(2);
      expect(toc[0].title).toBe("Introduction");
      expect(toc[0].anchorId).toBe("page-1");
    });
  });

  // 5. Normalization Service Tests
  describe("NormalizationService", () => {
    it("should strip boundary headers and footers from markdown body", () => {
      const markdown = "Header Text\n\nMain content body\n\nFooter Text";
      const stripped = NormalizationService.stripBoundaryBlocks(
        markdown,
        ["Header Text"],
        ["Footer Text"]
      );
      expect(stripped).toBe("Main content body");
    });

    it("should reindent Python-like code blocks cleanly", () => {
      const codeBlock = "```python\ndef hello():\nprint(\"Hi\")\n```";
      const normalized = NormalizationService.normalizeCodeBlocks(codeBlock);
      expect(normalized).toContain("    print");
    });
  });

  // 6. Endnote Service Tests
  describe("EndnoteService", () => {
    it("should extract footers and match them with body reference markers", () => {
      const mockPages = [
        {
          pageIndex: 0,
          markdown: "This is some body text with a reference [1] here.",
          footers: ["[1] Footnote explanation text."]
        }
      ];

      const { rewrittenPages, endnotes } = EndnoteService.buildEndnotes(mockPages);
      expect(endnotes).toHaveLength(1);
      expect(endnotes[0].marker).toBe("1");
      expect(endnotes[0].text).toBe("Footnote explanation text.");
      expect(endnotes[0].linked).toBe(true);
      expect(rewrittenPages[0].markdown).toContain('<sup id="endnote-ref-1"><a href="#endnote-1">[1]</a></sup>');
    });
  });

  // 7. Preview Render Service Tests
  describe("PreviewRenderService", () => {
    it("should compile headings, bold, italic, lists, and links into HTML", () => {
      const md = "# Heading 1\n\nThis is **bold** and *italic* text.\n\n- Item 1\n- Item 2\n\n[Link](https://google.com)";
      const html = PreviewRenderService.compileMarkdown(md);
      
      expect(html).toContain("<h1>Heading 1</h1>");
      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<em>italic</em>");
      expect(html).toContain("<ul>");
      expect(html).toContain("<li>Item 1</li>");
      expect(html).toContain('<a href="https://google.com">Link</a>');
    });

    it("should replace image and table placeholders in markdown rendering", () => {
      const md = "Here is an image ![img-1](img-1) and a table [tbl-1](tbl-1)";
      const pages = [
        {
          pageIndex: 0,
          pageNumber: 1,
          anchorId: "page-1",
          markdown: md,
          images: [{ id: "img-1", width: 400, height: 300, source_path: "cover.png" }],
          tables: [{ id: "tbl-1", contentHtml: "<table><tr><td>Cell</td></tr></table>" }]
        }
      ];

      const html = PreviewRenderService.renderBodySections(pages, "/api/files");
      expect(html).toContain('src="/api/files/cover.png"');
      expect(html).toContain('<section id="page-1">');
      expect(html).toContain("<table><tr><td>Cell</td></tr></table>");
    });

    it("should render OCR images using the normalized saved filename", () => {
      const html = PreviewRenderService.renderBodySections(
        [
          {
            pageIndex: 0,
            pageNumber: 1,
            anchorId: "page-1",
            markdown: "OCR image ![detected illustration](img/cover)",
            images: [
              {
                id: "img/cover",
                fileName: "img_cover.jpg",
                mimeType: "image/jpeg",
                imageBase64: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
                width: 400,
                height: 300
              }
            ],
            tables: []
          }
        ],
        "/api/books/book-id/files/images"
      );

      expect(html).toContain('src="/api/books/book-id/files/images/img_cover.jpg"');
      expect(html).toContain('<section id="page-1">');
    });

    it("should render live OCR image references with existing Mistral filenames", () => {
      const html = PreviewRenderService.renderBodySections(
        [
          {
            pageIndex: 0,
            pageNumber: 1,
            anchorId: "page-1",
            markdown: "OCR image ![img-0.jpeg](img-0.jpeg)",
            images: [
              {
                id: "img-0.jpeg",
                fileName: "img-0.jpeg",
                mimeType: "image/jpeg",
                imageBase64: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
                width: 200,
                height: 150
              }
            ],
            tables: []
          }
        ],
        "/api/books/book-id/files/images"
      );

      expect(html).toContain('src="/api/books/book-id/files/images/img-0.jpeg"');
    });

    it("should not render OCR image placeholders when base64 payload is missing", () => {
      const html = PreviewRenderService.renderBodySections(
        [
          {
            pageIndex: 0,
            pageNumber: 1,
            anchorId: "page-1",
            markdown: "Missing image ![img-0.jpeg](img-0.jpeg)",
            images: [
              {
                id: "img-0.jpeg",
                fileName: "img-0.jpeg",
                mimeType: "image/jpeg",
                width: 200,
                height: 150
              }
            ],
            tables: []
          }
        ],
        "/api/books/book-id/files/images"
      );

      expect(html).not.toContain("/api/books/book-id/files/images/img-0.jpeg");
    });

    it("should render one-based fallback page anchors when anchorId is absent", () => {
      const html = PreviewRenderService.renderBodySections(
        [
          {
            pageIndex: 0,
            pageNumber: 1,
            markdown: "First page",
            images: [],
            tables: []
          }
        ],
        "/api/files"
      );

      expect(html).toContain('<section id="page-1">');
      expect(html).not.toContain('<section id="page-0">');
    });
  });

  // 8. Cover Extraction Service Tests
  describe("CoverExtractionService", () => {
    it("should write a PNG first-page cover in mock test mode", async () => {
      const tempPng = "temp_mock_cover.png";
      await CoverExtractionService.extractPdfFirstPageCover("dummy.pdf", tempPng);

      expect(fs.existsSync(tempPng)).toBe(true);
      const content = fs.readFileSync(tempPng);
      expect([...content.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      fs.unlinkSync(tempPng);
    });
  });

  // 9. EPUB Packager Tests
  describe("EpubPackager", () => {
    it("should map one-based TOC page anchors to zero-based generated XHTML files", () => {
      const epubBuffer = EpubPackager.createEpub(
        "book-id",
        {
          title: "Test Book",
          authors: ["Author"],
          language: "en",
          isbnNumbers: [],
          toc: {
            entries: [{ title: "Start", level: 1, anchorId: "page-1" }]
          }
        },
        [
          { pageIndex: 0, markdown: "First page", images: [], tables: [] },
          { pageIndex: 1, markdown: "Second page", images: [], tables: [] }
        ],
        [],
        null
      );

      const zip = new AdmZip(epubBuffer);
      const tocNcx = zip.readAsText("OEBPS/toc.ncx");
      expect(tocNcx).toContain('<content src="xhtml/page-0.xhtml"/>');
      expect(tocNcx).not.toContain('<content src="xhtml/page-1.xhtml"/>');
    });
  });

  // 10. Auth Service Tests
  describe("AuthService", () => {
    it("should sign and verify JWT tokens cleanly", async () => {
      const auth = new AuthService();
      const mockUser: any = { id: "user-1234-uuid", displayName: "Yann LeCun" };
      const token = auth.generateToken(mockUser);
      
      expect(token).toBeDefined();
      const verified = auth.verifyToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe("user-1234-uuid");
      expect(verified?.displayName).toBe("Yann LeCun");
    });
  });
});
