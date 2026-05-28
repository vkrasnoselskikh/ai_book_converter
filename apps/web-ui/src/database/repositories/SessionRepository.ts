import { AppDataSource } from "../dataSource.js";
import { AnonymousSession } from "../entities/AnonymousSession.js";
import { SessionBook } from "../entities/SessionBook.js";

export class SessionRepository {
  private repo = AppDataSource.getRepository(AnonymousSession);
  private sessionBookRepo = AppDataSource.getRepository(SessionBook);

  async findById(id: string): Promise<AnonymousSession | null> {
    return this.repo.findOneBy({ id });
  }

  async create(expiresInHours: number = 24 * 30): Promise<AnonymousSession> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const session = this.repo.create({
      expiresAt,
    });
    return this.repo.save(session);
  }

  async updateLastSeen(id: string): Promise<AnonymousSession | null> {
    const session = await this.repo.findOneBy({ id });
    if (!session) return null;
    session.lastSeenAt = new Date();
    return this.repo.save(session);
  }

  async mergeSessionIntoUser(sessionId: string, userId: string): Promise<AnonymousSession | null> {
    const session = await this.repo.findOneBy({ id: sessionId });
    if (!session) return null;
    session.mergedIntoUserId = userId;
    return this.repo.save(session);
  }

  // Get all session-book links for linking/account migration
  async getBooksBySession(sessionId: string): Promise<SessionBook[]> {
    return this.sessionBookRepo.find({
      where: { sessionId },
    });
  }
}
