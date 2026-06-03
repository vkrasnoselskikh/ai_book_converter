import { AppDataSource } from "../dataSource.js";
import { Book } from "../entities/Book.js";
import { SessionBook } from "../entities/SessionBook.js";
import { UserBook } from "../entities/UserBook.js";
import { BookMetadata } from "../entities/BookMetadata.js";

export class BookRepository {
  private repo = AppDataSource.getRepository(Book);
  private sessionBookRepo = AppDataSource.getRepository(SessionBook);
  private userBookRepo = AppDataSource.getRepository(UserBook);
  private metadataRepo = AppDataSource.getRepository(BookMetadata);

  async findById(id: string): Promise<Book | null> {
    return this.repo.findOne({
      where: { id },
      relations: { metadata: true },
    });
  }

  // Find book and verify anonymous session access
  async findByIdAndSession(
    bookId: string,
    sessionId: string,
  ): Promise<Book | null> {
    const link = await this.sessionBookRepo.findOne({
      where: { bookId, sessionId },
    });
    if (!link) return null;
    return this.findById(bookId);
  }

  // Find book and verify authenticated user access
  async findByIdAndUser(bookId: string, userId: string): Promise<Book | null> {
    const link = await this.userBookRepo.findOne({
      where: { bookId, userId },
    });
    if (!link) return null;
    return this.findById(bookId);
  }

  // Find all books owned by an anonymous session
  async findAllBySession(sessionId: string): Promise<Book[]> {
    const links = await this.sessionBookRepo.find({
      where: { sessionId },
      relations: { book: { metadata: true } },
    });
    return links.map((l) => l.book);
  }

  // Find all books owned by a user
  async findAllByUser(userId: string): Promise<Book[]> {
    const links = await this.userBookRepo.find({
      where: { userId },
      relations: { book: { metadata: true } },
    });
    return links.map((l) => l.book);
  }

  // Create a new book
  async create(
    originalFileName: string,
    sourceFormat: "epub" | "djvu" | "pdf",
    storagePath: string,
  ): Promise<Book> {
    const book = this.repo.create({
      originalFileName,
      sourceFormat,
      storagePath,
      status: "uploaded",
    });
    return this.repo.save(book);
  }

  // Link book to session
  async linkToSession(
    bookId: string,
    sessionId: string,
    role: "owner" | "reader" = "owner",
  ): Promise<SessionBook> {
    const link = this.sessionBookRepo.create({ bookId, sessionId, role });
    return this.sessionBookRepo.save(link);
  }

  // Link book to user
  async linkToUser(
    bookId: string,
    userId: string,
    role: "owner" | "reader" = "owner",
  ): Promise<UserBook> {
    // Unique check or handle UPSERT/ignore
    const existing = await this.userBookRepo.findOne({
      where: { bookId, userId },
    });
    if (existing) return existing;

    const link = this.userBookRepo.create({ bookId, userId, role });
    return this.userBookRepo.save(link);
  }

  // Update book status
  async updateStatus(
    id: string,
    status: "uploaded" | "processing" | "ready" | "failed",
    statusMessage?: string | null,
  ): Promise<Book> {
    const book = await this.repo.findOneBy({ id });
    if (!book) throw new Error(`Book ${id} not found`);
    book.status = status;
    if (statusMessage !== undefined) {
      book.statusMessage = statusMessage;
    }
    return this.repo.save(book);
  }

  // Save metadata
  async saveMetadata(
    bookId: string,
    data: Partial<BookMetadata>,
  ): Promise<BookMetadata> {
    let metadata = await this.metadataRepo.findOneBy({ bookId });
    if (!metadata) {
      metadata = this.metadataRepo.create({
        bookId,
        title: data.title || "Untitled",
        authors: data.authors || [],
        isbnNumbers: data.isbnNumbers || [],
        language: data.language || "en",
        description: data.description || null,
        coverSubtitle: data.coverSubtitle || null,
        coverPath: data.coverPath || null,
        toc: data.toc || { entries: [] },
      });
    } else {
      Object.assign(metadata, data);
    }
    return this.metadataRepo.save(metadata);
  }
}
