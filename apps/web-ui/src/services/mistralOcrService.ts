import { Mistral } from "@mistralai/mistralai";
import fs from "fs";
import { config } from "../config/appConfig.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("mistralOcrService");

export interface OcrImage {
  id: string;
  top_left_x?: number;
  top_left_y?: number;
  bottom_right_x?: number;
  bottom_right_y?: number;
  image_base64?: string;
}

export interface OcrTable {
  id: string;
  content: string;
}

export interface OcrPage {
  index: number;
  page_index?: number; // fallback/alternate field
  markdown: string;
  images: OcrImage[];
  tables: OcrTable[];
  headers?: string[];
  footers?: string[];
  header?: string; // alternate
  footer?: string; // alternate
}

export interface NormalizedPage {
  pageIndex: number;
  pageNumber: number;
  anchorId: string;
  markdown: string;
  images: Array<{
    id: string;
    width: number;
    height: number;
    imageBase64?: string;
  }>;
  tables: Array<{
    id: string;
    contentHtml: string;
  }>;
  headers: string[];
  footers: string[];
}

export class MistralOcrService {
  private client: Mistral | null = null;

  constructor() {
    if (config.mistralApiKey) {
      this.client = new Mistral({ apiKey: config.mistralApiKey });
    }
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  // Primary method to process PDF/documents
  async processDocument(filePath: string): Promise<NormalizedPage[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found for OCR: ${filePath}`);
    }

    let rawOcrResult: any;

    if (process.env.NODE_ENV === "test" || !this.client) {
      logger.info("Running Mistral OCR in Mock/Test Mode");
      rawOcrResult = this.getMockOcrResponse();
    } else {
      try {
        logger.info(`Starting live upload of ${filePath} to Mistral...`);
        const uploadResponse = await this.client.files.upload({
          file: fs.createReadStream(filePath) as any,
          purpose: "ocr"
        });

        logger.info(`File uploaded to Mistral. ID: ${uploadResponse.id}`);

        const signedUrl = await this.client.files.getSignedUrl({
          fileId: uploadResponse.id
        });

        logger.info(`Starting Mistral OCR process using model: ${config.mistralOcrModel}`);
        const ocrResponse = await this.client.ocr.process({
          model: config.mistralOcrModel,
          document: {
            type: "document_url",
            documentUrl: signedUrl.url
          },
          tableFormat: "html",
          includeImageBase64: true,
          extractHeader: true,
          extractFooter: true
        });

        // Parse response
        rawOcrResult = typeof ocrResponse === "string" ? JSON.parse(ocrResponse) : ocrResponse;
      } catch (err: any) {
        logger.error("Mistral OCR api failed, falling back or throwing: ", err);
        throw new Error(`Mistral OCR Service Error: ${err.message}`);
      }
    }

    return this.normalizeOcrResponse(rawOcrResult);
  }

  // Normalize raw OCR pages into clean TypeScript objects
  normalizeOcrResponse(rawResponse: any): NormalizedPage[] {
    const rawPages: OcrPage[] = rawResponse.pages || [];
    
    return rawPages.map((rawPage) => {
      const pageIndex = typeof rawPage.index === "number" 
        ? rawPage.index 
        : (typeof rawPage.page_index === "number" ? rawPage.page_index : 0);
      
      const pageNumber = pageIndex + 1;
      const anchorId = `page-${pageNumber}`;

      // Headers extraction (accept string array or raw header string)
      let headers: string[] = [];
      if (rawPage.headers && Array.isArray(rawPage.headers)) {
        headers = rawPage.headers;
      } else if (rawPage.header && typeof rawPage.header === "string") {
        headers = [rawPage.header];
      }

      // Footers extraction (accept string array or raw footer string)
      let footers: string[] = [];
      if (rawPage.footers && Array.isArray(rawPage.footers)) {
        footers = rawPage.footers;
      } else if (rawPage.footer && typeof rawPage.footer === "string") {
        footers = [rawPage.footer];
      }

      // Images normalization
      const images = (rawPage.images || []).map((img) => {
        const width = Math.max(0, (img.bottom_right_x || 0) - (img.top_left_x || 0));
        const height = Math.max(0, (img.bottom_right_y || 0) - (img.top_left_y || 0));
        return {
          id: img.id || `img-${Math.random().toString(36).substr(2, 9)}`,
          width: width || 400,
          height: height || 300,
          imageBase64: img.image_base64
        };
      });

      // Tables normalization
      const tables = (rawPage.tables || []).map((tbl) => ({
        id: tbl.id || `tbl-${Math.random().toString(36).substr(2, 9)}`,
        contentHtml: tbl.content || ""
      }));

      return {
        pageIndex,
        pageNumber,
        anchorId,
        markdown: rawPage.markdown || "",
        images,
        tables,
        headers,
        footers
      };
    });
  }

  // Returns safe mock OCR response structure for tests or unconfigured environments
  private getMockOcrResponse() {
    return {
      pages: [
        {
          index: 0,
          markdown: "# Premium Artificial Intelligence\nThis is the cover or first page content of our premium book.\n![img1](img1)\nHere is some additional intro text.",
          images: [
            {
              id: "img1",
              top_left_x: 10,
              top_left_y: 10,
              bottom_right_x: 210,
              bottom_right_y: 160,
              image_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
          ],
          tables: [],
          headers: ["Artificial Intelligence: A Modern Guide"],
          footers: ["[1] First footnote description."]
        },
        {
          index: 1,
          markdown: "## Chapter 1: Introduction to Agents\nIn this chapter, we explore how autonomous agents can operate safely in complex environments.\n[tbl1](tbl1)\nThis table highlights system comparisons.\nAnd another sentence here.",
          images: [],
          tables: [
            {
              id: "tbl1",
              content: "<table class='table'><tr><th>Model</th><th>Score</th></tr><tr><td>Mistral Large</td><td>95%</td></tr></table>"
            }
          ],
          headers: ["Chapter 1: Intro"],
          footers: ["[2] Second footnote description."]
        }
      ]
    };
  }
}
