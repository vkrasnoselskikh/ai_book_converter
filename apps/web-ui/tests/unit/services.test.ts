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
import { initializeDatabase } from "../../src/database/dataSource.js";

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
          markdown: md,
          images: [{ id: "img-1", width: 400, height: 300, source_path: "cover.png" }],
          tables: [{ id: "tbl-1", contentHtml: "<table><tr><td>Cell</td></tr></table>" }]
        }
      ];

      const html = PreviewRenderService.renderBodySections(pages, "/api/files");
      expect(html).toContain('src="/api/files/cover.png"');
      expect(html).toContain("<table><tr><td>Cell</td></tr></table>");
    });
  });

  // 8. Auth Service Tests
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
