import {
  Agent,
  OpenAIProvider,
  Runner,
  setDefaultModelProvider,
  setDefaultOpenAIKey,
  setOpenAIAPI,
} from "@openai/agents";
import { config } from "../config/appConfig.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("agentService");

export interface BookMetadataAgentResult {
  title: string;
  authors: string[];
  isbn_numbers: string[];
  language: string;
  cover_subtitle: string | null;
  cover_image: string; // base64 string
}

export interface TocAgentEntry {
  title: string;
  level: number;
  anchorId: string;
}

export class AgentService {
  private isLive = !!config.mistralApiKey;
  private model = config.mistralLlmModel || "pixtral-12b-latest";
  private runner: Runner | null = this.createMistralRunner();

  // Extracts book metadata using MetadataAgent
  async extractMetadata(pagesText: string): Promise<BookMetadataAgentResult> {
    if (process.env.NODE_ENV === "test" || !this.isLive) {
      logger.info("Extracting metadata in mock mode");
      return this.getMockMetadataResult();
    }

    try {
      logger.info("Running live Metadata Agent using Mistral provider via `@openai/agents`...");
      
      const instructions = `You are a professional book cataloger and archiver.
Analyze the provided front-matter page text of a book (which contains the cover, title page, copyright page, etc.).
Extract the metadata into a JSON format.
Your output must be a single, valid JSON object matching this schema:
{
  "title": "String title",
  "authors": ["Author 1", "Author 2"],
  "isbn_numbers": ["ISBN 1", "ISBN 2"],
  "language": "ISO 639-1 language code, e.g. en",
  "cover_subtitle": "Subtitle string or null",
  "cover_image": "A placeholder 1x1 pixel PNG transparent base64 string or an extracted base64 string if found"
}
Do NOT include any extra conversational text or markdown code blocks (like \`\`\`json). Output raw valid JSON only.`;

      const metadataAgent = new Agent({
        name: "MetadataAgent",
        instructions,
        model: this.model
      });

      const prompt = `Here is the extracted text from the first three pages of the book:\n\n${pagesText}\n\nExtract and return the metadata JSON object.`;
      const runResult = await this.getRunner().run(metadataAgent, prompt);

      const cleanedOutput = this.cleanJsonString(runResult.finalOutput || "");
      const parsed = JSON.parse(cleanedOutput);

      return {
        title: parsed.title || "Untitled",
        authors: Array.isArray(parsed.authors) && parsed.authors.length > 0 ? parsed.authors : ["Unknown"],
        isbn_numbers: Array.isArray(parsed.isbn_numbers) ? parsed.isbn_numbers : [],
        language: parsed.language || "en",
        cover_subtitle: parsed.cover_subtitle || null,
        cover_image: parsed.cover_image || this.getPlaceholderCoverImage()
      };
    } catch (err: any) {
      logger.error("Metadata Agent failed: ", err);
      // Fallback
      return this.getMockMetadataResult();
    }
  }

  // Generates Table of Contents using TocAgent
  async extractTableOfContents(pages: Array<{ pageNumber: number; text: string }>): Promise<TocAgentEntry[]> {
    if (process.env.NODE_ENV === "test" || !this.isLive) {
      logger.info("Extracting TOC in mock mode");
      return this.getMockTocResult();
    }

    try {
      logger.info("Running live TOC Agent using Mistral provider via `@openai/agents`...");

      const pagesInput = pages.map(p => `[Page Number: ${p.pageNumber}]\n${p.text}\n===`).join("\n");

      const instructions = `You are a specialist in book structure and formatting.
Analyze the text of pages 3 to 10 of a book to build the Table of Contents (TOC).
For each section you identify, output the title, the heading level (1 for main chapters, 2 for sub-chapters, etc.), and the anchor ID of the page it starts on.
The anchor ID MUST match the page number exactly in the format: page-<pageNumber>. E.g., if a chapter starts on Page Number: 4, the anchor ID is "page-4".
You must NOT return raw page numbers as user-facing text, only as part of the anchorId.
Your output must be a single, valid JSON array matching this schema:
[
  {
    "title": "Introduction",
    "level": 1,
    "anchorId": "page-3"
  },
  {
    "title": "1.1 Main Concept",
    "level": 2,
    "anchorId": "page-4"
  }
]
Do NOT include any extra conversational text or markdown code blocks (like \`\`\`json). Output raw valid JSON only.`;

      const tocAgent = new Agent({
        name: "TableOfContentsAgent",
        instructions,
        model: this.model
      });

      const prompt = `Here are pages 3 through 10 with their corresponding one-based Page Numbers:\n\n${pagesInput}\n\nGenerate and return the TOC JSON array.`;
      const runResult = await this.getRunner().run(tocAgent, prompt);

      const cleanedOutput = this.cleanJsonString(runResult.finalOutput || "");
      const parsed = JSON.parse(cleanedOutput);

      if (Array.isArray(parsed)) {
        return parsed.map((entry: any) => ({
          title: entry.title || "Section",
          level: typeof entry.level === "number" ? entry.level : 1,
          anchorId: entry.anchorId || `page-${entry.pageNumber || 3}`
        }));
      }

      return this.getMockTocResult();
    } catch (err: any) {
      logger.error("TOC Agent failed: ", err);
      return this.getMockTocResult();
    }
  }

  // Utilities to clean JSON response formatting
  private cleanJsonString(str: string): string {
    let cleaned = str.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    return cleaned.trim();
  }

  private createMistralRunner(): Runner | null {
    if (!config.mistralApiKey) {
      return null;
    }

    setOpenAIAPI("chat_completions");
    setDefaultOpenAIKey(config.mistralApiKey);

    const modelProvider = new OpenAIProvider({
      apiKey: config.mistralApiKey,
      baseURL: "https://api.mistral.ai/v1",
      useResponses: false,
    });
    setDefaultModelProvider(modelProvider);

    return new Runner({
      modelProvider,
      tracingDisabled: true,
      traceIncludeSensitiveData: false,
      workflowName: "AI Book Converter Mistral extraction",
    });
  }

  private getRunner(): Runner {
    if (!this.runner) {
      throw new Error("Mistral API key is not configured for AgentService");
    }
    return this.runner;
  }

  private getPlaceholderCoverImage(): string {
    // 1x1 transparent pixel PNG base64
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  }

  private getMockMetadataResult(): BookMetadataAgentResult {
    return {
      title: "Premium Artificial Intelligence: A Modern Guide",
      authors: ["Andrey Karpathy", "Yann LeCun"],
      isbn_numbers: ["ISBN 978-3-16-148410-0"],
      language: "en",
      cover_subtitle: "Building Autonomous Systems Safely",
      cover_image: this.getPlaceholderCoverImage()
    };
  }

  private getMockTocResult(): TocAgentEntry[] {
    return [
      {
        title: "Introduction",
        level: 1,
        anchorId: "page-1"
      },
      {
        title: "Chapter 1: Agent Architectures",
        level: 1,
        anchorId: "page-2"
      }
    ];
  }
}
