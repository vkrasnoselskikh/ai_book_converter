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
import { User } from "./User.js";
import { Book } from "./Book.js";

@Entity("user_books")
@Unique(["userId", "bookId"])
export class UserBook {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "uuid" })
  bookId!: string;

  @Column({ type: "varchar", default: "owner" })
  role!: "owner" | "reader";

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.userBooks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @ManyToOne(() => Book, (book) => book.userBooks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bookId" })
  book!: Relation<Book>;
}
