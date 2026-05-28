import { DataSource } from "typeorm";
import { User } from "./entities/User.js";
import { AuthIdentity } from "./entities/AuthIdentity.js";
import { AnonymousSession } from "./entities/AnonymousSession.js";
import { Book } from "./entities/Book.js";
import { BookMetadata } from "./entities/BookMetadata.js";
import { UserBook } from "./entities/UserBook.js";
import { SessionBook } from "./entities/SessionBook.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard App Config
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, "../../db.sqlite");

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: dbPath,
  synchronize: true, // Auto-create tables for development
  logging: false,
  entities: [
    User,
    AuthIdentity,
    AnonymousSession,
    Book,
    BookMetadata,
    UserBook,
    SessionBook
  ],
  subscribers: [],
  migrations: [],
});

export const initializeDatabase = async (): Promise<DataSource> => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  return AppDataSource;
};
