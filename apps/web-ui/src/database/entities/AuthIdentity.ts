import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Unique,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User.js";

@Entity("auth_identities")
@Unique(["provider", "providerSubject"])
export class AuthIdentity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "varchar" })
  provider!: "google" | "facebook" | "telegram";

  @Column({ type: "varchar" })
  providerSubject!: string;

  @Column({ type: "varchar", nullable: true })
  displayName!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.identities, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;
}
