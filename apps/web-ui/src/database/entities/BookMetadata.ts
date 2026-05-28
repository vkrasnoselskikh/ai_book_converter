import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Book } from "./Book.js";

@Entity("book_metadata")
export class BookMetadata {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  bookId!: string;

  @Column({ type: "varchar" })
  title!: string;

  @Column({ type: "simple-array" })
  authors!: string[];

  @Column({ type: "varchar", default: "en" })
  language!: string;

  @Column({ type: "simple-array" })
  isbnNumbers!: string[];

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", nullable: true })
  coverSubtitle!: string | null;

  @Column({ type: "varchar", nullable: true })
  coverPath!: string | null;

  @Column({ type: "simple-json" })
  toc!: any; // Stored as a JSON structure: { entries: Array<{ title: string, anchorId: string, level: number }> }

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToOne(() => Book, (book) => book.metadata, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bookId" })
  book!: Relation<Book>;
}
