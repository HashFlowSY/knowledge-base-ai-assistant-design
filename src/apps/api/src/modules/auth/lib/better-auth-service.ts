import {
  getSessionCookieValue,
  sessionPayloadSchema,
} from "@kb/auth";
import {
  type BetterAuthRuntime,
  createBetterAuthRuntime,
  extractSetCookieHeaders,
} from "@kb/auth/server";
import type { SessionPayload } from "@kb/auth";
import { schema, type ProjectDb } from "@kb/db";
import { isAppError } from "@kb/errors";
import { createLogger, createSafeErrorLogFields } from "@kb/observability";
import { resolveSessionPayload } from "@kb/users/service";

import type { AuthService } from "../../../contracts";
import {
  signOutWithCookieHeader,
  signOutWithSetCookieHeaders,
} from "./cookies";
import {
  createExpiredSessionError,
  createForbiddenAccessError,
  createInvalidCredentialsError,
  createInternalError,
  createMissingSessionError,
  isBetterAuthUnauthorized,
} from "./errors";

export interface BetterAuthServiceOptions {
  appBaseUrl: string;
  betterAuthSecret: string;
  db: ProjectDb;
}

export function createBetterAuthService(
  options: BetterAuthServiceOptions,
): AuthService {
  const runtime = createBetterAuthRuntime({
    appBaseUrl: options.appBaseUrl,
    db: options.db,
    schema,
    secret: options.betterAuthSecret,
  });

  return createBetterAuthServiceFromRuntime({
    appBaseUrl: options.appBaseUrl,
    db: options.db,
    runtime,
  });
}

export function createBetterAuthServiceFromRuntime(input: {
  appBaseUrl?: string;
  db: ProjectDb;
  resolveSessionPayload?: ResolveSessionPayload;
  runtime: Pick<BetterAuthRuntime, "api" | "handler">;
}): AuthService {
  const logger = createLogger({ service: "api" });
  const resolvePayload = input.resolveSessionPayload ?? resolveSessionPayload;

  return {
    async login(credentials) {
      try {
        const result = await input.runtime.api.signInEmail({
          body: {
            email: credentials.email,
            password: credentials.password,
          },
          headers: new Headers({
            origin: input.appBaseUrl ?? "http://localhost:3000",
          }),
          returnHeaders: true,
        });
        const setCookieHeaders = extractSetCookieHeaders(result.headers);
        if (setCookieHeaders.length === 0) {
          throw createInternalError();
        }

        const payloadResult = await resolvePayload(input.db, {
          user: result.response.user,
        });
        if (isSessionPayloadResolutionError(payloadResult)) {
          if (payloadResult.reason === "default_tenant_unavailable") {
            throw createInternalError("default_tenant_unavailable");
          }

          const clearCookieHeaders = await signOutWithSetCookieHeaders(
            input.runtime,
            setCookieHeaders,
          );
          throw createForbiddenAccessError({
            setCookieHeaders: clearCookieHeaders,
          });
        }

        return {
          ok: true,
          payload: sessionPayloadSchema.parse(payloadResult),
          setCookieHeaders,
        };
      } catch (error) {
        if (isAppError(error)) {
          throw error;
        }

        if (isBetterAuthUnauthorized(error)) {
          throw createInvalidCredentialsError();
        }

        logger.error(
          "auth_login_failed",
          createSafeErrorLogFields(error, {
            message: "Auth login failed.",
          }),
        );
        throw createInternalError();
      }
    },
    async logout(inputContext) {
      try {
        const result = await input.runtime.api.signOut({
          headers: new Headers(
            inputContext.cookieHeader === null
              ? {}
              : { cookie: inputContext.cookieHeader },
          ),
          returnHeaders: true,
        });

        return {
          ok: true,
          setCookieHeaders: extractSetCookieHeaders(result.headers),
        };
      } catch (error) {
        logger.error(
          "auth_logout_failed",
          createSafeErrorLogFields(error, {
            message: "Auth logout failed.",
          }),
        );
        return { ok: true };
      }
    },
    async getSession(inputContext) {
      try {
        if (getSessionCookieValue(inputContext.cookieHeader) === null) {
          throw createMissingSessionError();
        }

        const result = await input.runtime.api.getSession({
          headers: new Headers({
            cookie: inputContext.cookieHeader ?? "",
          }),
        });

        if (result === null) {
          throw createExpiredSessionError();
        }

        const payloadResult = await resolvePayload(input.db, {
          user: result.user,
        });
        if (isSessionPayloadResolutionError(payloadResult)) {
          if (payloadResult.reason === "default_tenant_unavailable") {
            throw createInternalError("default_tenant_unavailable");
          }

          throw createForbiddenAccessError({
            setCookieHeaders: await signOutWithCookieHeader(
              input.runtime,
              inputContext.cookieHeader,
            ),
          });
        }

        return {
          ok: true,
          payload: sessionPayloadSchema.parse(payloadResult),
        };
      } catch (error) {
        if (isAppError(error)) {
          throw error;
        }

        logger.error(
          "auth_session_failed",
          createSafeErrorLogFields(error, {
            message: "Auth session lookup failed.",
          }),
        );
        throw createInternalError();
      }
    },
  };
}

type ResolveSessionPayload = (
  db: ProjectDb,
  input: { user: { email: string; id: string; name: string } },
) => ReturnType<typeof resolveSessionPayload>;

type SessionPayloadResolution = Awaited<ReturnType<typeof resolveSessionPayload>>;

function isSessionPayloadResolutionError(
  value: SessionPayloadResolution,
): value is Exclude<SessionPayloadResolution, SessionPayload> {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === false;
}
