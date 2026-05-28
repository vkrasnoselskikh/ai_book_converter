import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import type { Relation } from "typeorm";
import { SessionBook } from "./SessionBook.js";

@Entity("anonymous_sessions")
export class AnonymousSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  mergedIntoUserId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  lastSeenAt!: Date;

  @Column({ type: "datetime", nullable: true })
  expiresAt!: Date | null;

  @OneToMany(() => SessionBook, (sessionBook) => sessionBook.session)
  sessionBooks!: Relation<SessionBook[]>;
}
