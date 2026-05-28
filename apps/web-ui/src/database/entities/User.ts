import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import type { Relation } from "typeorm";
import { AuthIdentity } from "./AuthIdentity.js";
import { UserBook } from "./UserBook.js";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", nullable: true })
  displayName!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => AuthIdentity, (identity) => identity.user)
  identities!: Relation<AuthIdentity[]>;

  @OneToMany(() => UserBook, (userBook) => userBook.user)
  userBooks!: Relation<UserBook[]>;
}
