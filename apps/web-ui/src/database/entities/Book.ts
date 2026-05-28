import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from "typeorm";
import type { Relation } from "typeorm";
import { UserBook } from "./UserBook.js";
import { SessionBook } from "./SessionBook.js";
import { BookMetadata } from "./BookMetadata.js";

@Entity("books")
export class Book {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  originalFileName!: string;

  @Column({ type: "varchar" })
  sourceFormat!: "epub" | "djvu";

  @Column({ type: "varchar" })
  storagePath!: string;

  @Column({ type: "varchar", default: "uploaded" })
  status!: "uploaded" | "processing" | "ready" | "failed";

  @Column({ type: "text", nullable: true })
  statusMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => UserBook, (userBook) => userBook.book)
  userBooks!: Relation<UserBook[]>;

  @OneToMany(() => SessionBook, (sessionBook) => sessionBook.book)
  sessionBooks!: Relation<SessionBook[]>;

  @OneToOne(() => BookMetadata, (metadata) => metadata.book)
  metadata!: Relation<BookMetadata>;
}
