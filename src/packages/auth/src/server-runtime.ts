import { betterAuth } from "better-auth";
import {
  drizzleAdapter,
  type DB,
  type DrizzleAdapterConfig,
} from "better-auth/adapters/drizzle";

import { betterAuthDatabaseOptions } from "./server-options";

export interface BetterAuthRuntimeOptions {
  appBaseUrl: string;
  db: DB;
  schema: Record<string, unknown>;
  secret: string;
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
