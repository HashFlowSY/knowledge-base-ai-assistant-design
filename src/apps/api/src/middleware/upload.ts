import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";

import type { SessionPayload } from "@kb/auth";

import type {
  ApiEnv,
  ApiRateLimiter,
  AuthService,
  UploadConcurrencyLimiter,
  UploadConfig,
} from "../contracts";
import {
  appendSetCookieHeaders,
  respondWithError,
  respondWithValidationError,
} from "../http";
import { rateLimitDocumentUpload } from "../guards";
import { setAuthenticatedContext } from "./auth";
import { createDocumentUploadRejectionRateLimitHandler } from "./rate-limit";

export interface DocumentUploadContext {
  actor: SessionPayload;
  knowledgeBaseId: string;
}

export function createDocumentUploadPreflightMiddleware(input: {
  authService: AuthService;
  paramsSchema: z.ZodType<{ knowledgeBaseId: string }>;
  rateLimiter: ApiRateLimiter;
  uploadConcurrencyLimiter: UploadConcurrencyLimiter;
  uploadConfig: UploadConfig;
}): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const rejectWithUploadRateLimit = createDocumentUploadRejectionRateLimitHandler(
      input.rateLimiter,
      input.uploadConfig.rateLimitPerMinute,
    );
    const sessionResult = await input.authService.getSession({
      cookieHeader: context.req.header("cookie") ?? null,
    });
    if (!sessionResult.ok) {
      appendSetCookieHeaders(context, sessionResult.setCookieHeaders);
      return rejectWithUploadRateLimit(
        context,
        respondWithError(context, {
          code: sessionResult.code,
          httpStatus: sessionResult.httpStatus,
          message: sessionResult.message,
        }),
      );
    }

    const actor = sessionResult.payload;
    setAuthenticatedContext(context, actor);

    const rateLimitResponse = await rateLimitDocumentUpload(
      context,
      input.rateLimiter,
      actor,
      input.uploadConfig.rateLimitPerMinute,
    );
    if (rateLimitResponse !== null) {
      return rateLimitResponse;
    }

    const params = input.paramsSchema.safeParse(context.req.param());
    if (!params.success) {
      return respondWithValidationError(context, params.error);
    }

    const reservationResult = input.uploadConcurrencyLimiter.acquire({
      actorKey: `${actor.tenant.id}:${actor.user.id}`,
      actorLimit: input.uploadConfig.concurrencyPerActor,
      tenantKey: actor.tenant.id,
      tenantLimit: input.uploadConfig.concurrencyPerTenant,
    });
    if (!reservationResult.ok) {
      return respondWithError(context, {
        code: "RATE_LIMITED",
        httpStatus: 429,
        message:
          reservationResult.scope === "actor"
            ? "当前账号上传任务过多，请稍后重试。"
            : "当前租户上传任务过多，请稍后重试。",
      });
    }

    context.set("documentUpload", {
      actor,
      knowledgeBaseId: params.data.knowledgeBaseId,
    });
    try {
      return await next();
    } finally {
      reservationResult.reservation.release();
      context.set("documentUpload", null);
    }
  };
}

export function getDocumentUploadContext(
  context: Context<ApiEnv>,
): DocumentUploadContext {
  const uploadContext = context.get("documentUpload");
  if (uploadContext === null) {
    throw new Error("Missing document upload context");
  }

  return uploadContext;
}
