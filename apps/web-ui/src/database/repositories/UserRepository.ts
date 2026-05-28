import { AppDataSource } from "../dataSource.js";
import { User } from "../entities/User.js";
import { AuthIdentity } from "../entities/AuthIdentity.js";

export class UserRepository {
  private repo = AppDataSource.getRepository(User);
  private identityRepo = AppDataSource.getRepository(AuthIdentity);

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({
      where: { id },
      relations: ["identities"],
    });
  }

  // Find user by external auth identity
  async findByIdentity(provider: "google" | "facebook" | "telegram", providerSubject: string): Promise<User | null> {
    const identity = await this.identityRepo.findOne({
      where: { provider, providerSubject },
      relations: ["user"],
    });
    if (!identity) return null;
    return identity.user;
  }

  // Create User
  async createUser(displayName: string | null = null): Promise<User> {
    const user = this.repo.create({ displayName });
    return this.repo.save(user);
  }

  // Link auth identity to user
  async addIdentity(
    userId: string,
    provider: "google" | "facebook" | "telegram",
    providerSubject: string,
    displayName: string | null = null
  ): Promise<AuthIdentity> {
    const existing = await this.identityRepo.findOne({
      where: { provider, providerSubject },
    });
    if (existing) {
      if (existing.userId !== userId) {
        throw new Error(`AuthIdentity ${provider}:${providerSubject} is already linked to a different user`);
      }
      return existing;
    }

    const identity = this.identityRepo.create({
      userId,
      provider,
      providerSubject,
      displayName,
    });
    return this.identityRepo.save(identity);
  }

  // Create user and link auth identity together
  async createUserWithIdentity(
    provider: "google" | "facebook" | "telegram",
    providerSubject: string,
    displayName: string | null = null
  ): Promise<User> {
    const user = await this.createUser(displayName);
    await this.addIdentity(user.id, provider, providerSubject, displayName);
    return user;
  }
}
