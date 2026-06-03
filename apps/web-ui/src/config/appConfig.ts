import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base workspace path
const rootPath = path.resolve(__dirname, "../../../");
const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(rootPath, ".env"),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export const config = {
  port: parseInt(process.env.PORT || "8000", 10),
  jwtSecret:
    process.env.JWT_SECRET || "ai-book-converter-premium-secret-key-12345",
  mistralApiKey: process.env.MISTRAL_API_KEY || "",
  mistralOcrModel: process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest",
  mistralLlmModel: process.env.MISTRAL_LLM_MODEL || "mistral-small-latest",

  // Books Storage directory
  booksPath: (() => {
    const rawPath = process.env.AI_BOOK_COVERTER_BOOKS_PATH;
    if (rawPath) {
      return path.resolve(rawPath);
    }
    // Default fallback inside workspace/books
    const defaultPath = path.join(rootPath, "books");
    if (!fs.existsSync(defaultPath)) {
      fs.mkdirSync(defaultPath, { recursive: true });
    }
    return defaultPath;
  })(),
};
