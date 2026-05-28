import { BookRepository } from "../database/repositories/BookRepository.js";
import { SessionRepository } from "../database/repositories/SessionRepository.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("accountLinkingService");

export class AccountLinkingService {
  private bookRepository: BookRepository;
  private sessionRepository: SessionRepository;

  constructor() {
    this.bookRepository = new BookRepository();
    this.sessionRepository = new SessionRepository();
  }

  // Links all books in an anonymous session to an authenticated user
  async linkSessionToUser(sessionId: string, userId: string): Promise<void> {
    logger.info(`Starting account linking from session=${sessionId} to user=${userId}`);
    
    try {
      // 1. Get all session books
      const sessionBooks = await this.sessionRepository.getBooksBySession(sessionId);
      logger.info(`Found ${sessionBooks.length} books in session=${sessionId}`);

      // 2. Link each book to the user
      for (const sb of sessionBooks) {
        logger.info(`Linking bookId=${sb.bookId} to userId=${userId}`);
        await this.bookRepository.linkToUser(sb.bookId, userId, sb.role);
      }

      // 3. Mark session as merged
      await this.sessionRepository.mergeSessionIntoUser(sessionId, userId);
      logger.info(`Session=${sessionId} successfully merged into user=${userId}`);
    } catch (err: any) {
      logger.error(`Account linking failed for session=${sessionId}:`, err);
      throw new Error(`Account Linking Error: ${err.message}`);
    }
  }
}
