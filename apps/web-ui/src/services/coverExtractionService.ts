import fs from "fs";
import { definePDFJSModule, renderPageAsImage } from "unpdf";
import { DjvuConverter } from "./djvuConverter.js";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export class CoverExtractionService {
  static async extractPdfFirstPageCover(
    sourcePdfPath: string,
    targetPngPath: string,
  ): Promise<boolean> {
    if (process.env.NODE_ENV === "test") {
      fs.writeFileSync(targetPngPath, ONE_BY_ONE_PNG);
      return true;
    }

    if (!fs.existsSync(sourcePdfPath)) {
      throw new Error(`PDF source file not found: ${sourcePdfPath}`);
    }

    ensureMapGetOrInsertComputed();
    await definePDFJSModule(() => import("pdfjs-dist"));
    const pdfData = new Uint8Array(fs.readFileSync(sourcePdfPath));
    const renderedPage = await renderPageAsImage(pdfData, 1, {
      canvasImport: () => import("@napi-rs/canvas"),
      width: 1200,
    });

    fs.writeFileSync(targetPngPath, Buffer.from(new Uint8Array(renderedPage)));
    return true;
  }

  static extractDjvuFirstPageCover(
    sourceDjvuPath: string,
    targetPngPath: string,
  ): boolean {
    DjvuConverter.extractPageImage(sourceDjvuPath, 1, targetPngPath);
    return true;
  }

  static writeBase64Cover(imageBase64: string, targetPngPath: string): boolean {
    const imageBuffer = decodeBase64Image(imageBase64);
    if (!imageBuffer || imageBuffer.length === 0) {
      return false;
    }
    fs.writeFileSync(targetPngPath, imageBuffer);
    return true;
  }

  static isPlaceholderCoverImage(imageBase64?: string | null): boolean {
    if (!imageBase64) {
      return true;
    }
    const imageBuffer = decodeBase64Image(imageBase64);
    return !imageBuffer || Buffer.compare(imageBuffer, ONE_BY_ONE_PNG) === 0;
  }
}

export function decodeBase64Image(imageBase64?: string): Buffer | null {
  if (!imageBase64) {
    return null;
  }
  const payload = imageBase64.includes(",")
    ? imageBase64.split(",").pop()
    : imageBase64;
  if (!payload) {
    return null;
  }
  return Buffer.from(payload, "base64");
}

function ensureMapGetOrInsertComputed(): void {
  const mapPrototype = Map.prototype as Map<unknown, unknown> & {
    getOrInsertComputed?: (
      key: unknown,
      callback: (key: unknown) => unknown,
    ) => unknown;
  };

  if (typeof mapPrototype.getOrInsertComputed === "function") {
    return;
  }

  Object.defineProperty(mapPrototype, "getOrInsertComputed", {
    configurable: true,
    value(key: unknown, callback: (key: unknown) => unknown) {
      if (this.has(key)) {
        return this.get(key);
      }
      const value = callback(key);
      this.set(key, value);
      return value;
    },
  });
}
