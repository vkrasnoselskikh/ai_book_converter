import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Unique,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { AnonymousSession } from "./AnonymousSession.js";
import { Book } from "./Book.js";

@Entity("session_books")
@Unique(["sessionId", "bookId"])
export class SessionBook {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  sessionId!: string;

  @Column({ type: "uuid" })
  bookId!: string;

  @Column({ type: "varchar", default: "owner" })
  role!: "owner" | "reader";

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => AnonymousSession, (session) => session.sessionBooks, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "sessionId" })
  session!: Relation<AnonymousSession>;

  @ManyToOne(() => Book, (book) => book.sessionBooks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bookId" })
  book!: Relation<Book>;
}
