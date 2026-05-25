import { betterAuth, type Auth } from "better-auth";
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

type BetterAuthRuntimeConfig = ReturnType<typeof createBetterAuthRuntimeConfig>;

export type BetterAuthRuntime = Auth<BetterAuthRuntimeConfig>;

export function createBetterAuthRuntime(
  input: BetterAuthRuntimeOptions,
): BetterAuthRuntime {
  return betterAuth(createBetterAuthRuntimeConfig(input));
}

function createBetterAuthRuntimeConfig(input: BetterAuthRuntimeOptions) {
  return {
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
  };
}

export function createBetterAuthDrizzleAdapterConfig(
  schema: Record<string, unknown>,
): DrizzleAdapterConfig {
  return {
    provider: "pg",
    schema,
  };
}
