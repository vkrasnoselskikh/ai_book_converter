import fs from "fs";
import path from "path";
import { config } from "../config/appConfig.js";

export class BookStorageService {
  private baseBooksPath = config.booksPath;

  constructor() {
    if (!fs.existsSync(this.baseBooksPath)) {
      fs.mkdirSync(this.baseBooksPath, { recursive: true });
    }
  }

  // Get directory for specific book ID
  getBookDir(bookId: string): string {
    const bookDir = path.join(this.baseBooksPath, bookId);
    this.ensureSafePath(bookDir);
    return bookDir;
  }

  // Ensure directory exists
  ensureBookDir(bookId: string): string {
    const dir = this.getBookDir(bookId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  // Write file inside book subfolder
  writeFile(bookId: string, subFolder: string, fileName: string, content: Buffer | string): string {
    const bookDir = this.ensureBookDir(bookId);
    const targetFolder = path.join(bookDir, subFolder);
    
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const targetFilePath = path.join(targetFolder, fileName);
    this.ensureSafePath(targetFilePath);

    fs.writeFileSync(targetFilePath, content);
    return targetFilePath;
  }

  // Read file inside book subfolder
  readFile(bookId: string, subFolder: string, fileName: string): Buffer {
    const bookDir = this.getBookDir(bookId);
    const targetFilePath = path.join(bookDir, subFolder, fileName);
    this.ensureSafePath(targetFilePath);

    if (!fs.existsSync(targetFilePath)) {
      throw new Error(`File ${fileName} not found in ${subFolder} for book ${bookId}`);
    }
    return fs.readFileSync(targetFilePath);
  }

  // Check if file exists inside book subfolder
  fileExists(bookId: string, subFolder: string, fileName: string): boolean {
    try {
      const bookDir = this.getBookDir(bookId);
      const targetFilePath = path.join(bookDir, subFolder, fileName);
      this.ensureSafePath(targetFilePath);
      return fs.existsSync(targetFilePath);
    } catch {
      return false;
    }
  }

  // Prevent path traversal attacks
  private ensureSafePath(targetPath: string) {
    const resolvedPath = path.resolve(targetPath);
    if (!resolvedPath.startsWith(this.baseBooksPath)) {
      throw new Error("Path traversal restriction violated: target is outside books directory");
    }
  }
}
