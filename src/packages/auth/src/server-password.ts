import { hashPassword, verifyPassword } from "better-auth/crypto";

export interface PasswordAccountRepository {
  upsertPasswordAccount(input: {
    passwordHash: string;
    providerId: "credential";
    userId: string;
  }): Promise<void>;
}

export interface SessionRevocationRepository {
  revokeUserSessions(input: { userId: string }): Promise<void>;
}

export async function hashPasswordForAccount(password: string): Promise<string> {
  return hashPassword(password);
}

export async function verifyPasswordForAccount(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  return verifyPassword({
    hash: input.hash,
    password: input.password,
  });
}

export async function upsertPasswordAccount(input: {
  password: string;
  repository: PasswordAccountRepository;
  userId: string;
}): Promise<void> {
  const passwordHash = await hashPasswordForAccount(input.password);

  await input.repository.upsertPasswordAccount({
    passwordHash,
    providerId: "credential",
    userId: input.userId,
  });
}

export async function revokeUserSessions(input: {
  repository: SessionRevocationRepository;
  userId: string;
}): Promise<void> {
  await input.repository.revokeUserSessions({
    userId: input.userId,
  });
}
