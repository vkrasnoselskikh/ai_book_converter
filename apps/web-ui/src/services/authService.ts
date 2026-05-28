import jwt from "jsonwebtoken";
import { config } from "../config/appConfig.js";
import { UserRepository } from "../database/repositories/UserRepository.js";
import { SessionRepository } from "../database/repositories/SessionRepository.js";
import { User } from "../database/entities/User.js";
import { AnonymousSession } from "../database/entities/AnonymousSession.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("authService");

export interface AuthUserPayload {
  userId: string;
  displayName: string | null;
}

export class AuthService {
  private userRepository: UserRepository;
  private sessionRepository: SessionRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.sessionRepository = new SessionRepository();
  }

  // Generate JWT token for user session
  generateToken(user: User): string {
    const payload: AuthUserPayload = {
      userId: user.id,
      displayName: user.displayName
    };
    return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
  }

  // Verify and parse JWT token
  verifyToken(token: string): AuthUserPayload | null {
    try {
      return jwt.verify(token, config.jwtSecret) as AuthUserPayload;
    } catch (err) {
      logger.error("Token verification failed:", err);
      return null;
    }
  }

  // Handle mock authentication flow
  async handleMockAuth(
    provider: "google" | "facebook" | "telegram",
    providerSubject: string,
    displayName: string
  ): Promise<{ user: User; token: string }> {
    logger.info(`Handling mock login for provider=${provider}, subject=${providerSubject}`);
    
    // Find or create user via identity
    let user = await this.userRepository.findByIdentity(provider, providerSubject);
    
    if (!user) {
      logger.info(`Creating new user account for mock auth`);
      user = await this.userRepository.createUserWithIdentity(
        provider,
        providerSubject,
        displayName
      );
    } else {
      logger.info(`Found existing user with id=${user.id}`);
    }

    const token = this.generateToken(user as User);
    return { user: user as User, token };
  }

  // Get or create an anonymous session from an ID or undefined
  async resolveAnonymousSession(sessionId?: string): Promise<AnonymousSession> {
    if (sessionId) {
      const session = await this.sessionRepository.findById(sessionId);
      if (session && !session.mergedIntoUserId) {
        // Update last seen
        await this.sessionRepository.updateLastSeen(session.id);
        return session;
      }
    }
    
    // Create new session
    logger.info("Creating new anonymous session");
    return await this.sessionRepository.create();
  }
}
