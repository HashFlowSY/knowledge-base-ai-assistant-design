import { betterAuth } from "better-auth";
import {
  drizzleAdapter,
  type DB,
  type DrizzleAdapterConfig,
} from "better-auth/adapters/drizzle";
import { splitSetCookieHeader } from "better-auth/cookies";
import { hashPassword, verifyPassword } from "better-auth/crypto";

export const betterAuthDatabaseOptions = {
  user: {
    modelName: "authUsers",
    fields: {
      emailVerified: "emailVerified",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
  session: {
    modelName: "authSessions",
    fields: {
      userId: "userId",
      expiresAt: "expiresAt",
      ipAddress: "ipAddress",
      userAgent: "userAgent",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
  account: {
    modelName: "authAccounts",
    fields: {
      accountId: "accountId",
      providerId: "providerId",
      userId: "userId",
      accessToken: "encryptedAccessToken",
      refreshToken: "encryptedRefreshToken",
      idToken: "encryptedIdToken",
      accessTokenExpiresAt: "accessTokenExpiresAt",
      refreshTokenExpiresAt: "refreshTokenExpiresAt",
      password: "passwordHash",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
  verification: {
    modelName: "authVerifications",
    fields: {
      expiresAt: "expiresAt",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
} as const;

export interface BetterAuthRuntimeOptions {
  appBaseUrl: string;
  db: DB;
  schema: Record<string, unknown>;
  secret: string;
}

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

export function createBetterAuthRuntime(input: BetterAuthRuntimeOptions) {
  return betterAuth({
    baseURL: input.appBaseUrl,
    basePath: "/api/_better-auth",
    secret: input.secret,
    database: drizzleAdapter(
      input.db,
      createBetterAuthDrizzleAdapterConfig(input.schema),
    ),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    rateLimit: {
      enabled: false,
    },
    user: betterAuthDatabaseOptions.user,
    session: betterAuthDatabaseOptions.session,
    account: betterAuthDatabaseOptions.account,
    verification: betterAuthDatabaseOptions.verification,
  });
}

export type BetterAuthRuntime = ReturnType<typeof createBetterAuthRuntime>;

export function createBetterAuthDrizzleAdapterConfig(
  schema: Record<string, unknown>,
): DrizzleAdapterConfig {
  return {
    provider: "pg",
    schema,
  };
}

export function extractSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (headers as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }

  const setCookie = headers.get("set-cookie");
  return setCookie === null ? [] : splitSetCookieHeader(setCookie);
}
