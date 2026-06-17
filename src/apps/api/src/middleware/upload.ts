import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";

import type { SessionPayload } from "@kb/auth";
import { rateLimited, validationError } from "@kb/errors";

import type {
  ApiEnv,
  ApiRateLimiter,
  AuthService,
  UploadConcurrencyLimiter,
  UploadConfig,
} from "../contracts";
import {
  rateLimitDocumentUpload,
  rateLimitUnresolvedDocumentUpload,
} from "../guards";
import { setAuthenticatedContext } from "./auth";

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
    let sessionResult: Awaited<ReturnType<AuthService["getSession"]>>;
    try {
      sessionResult = await input.authService.getSession({
        cookieHeader: context.req.header("cookie") ?? null,
      });
    } catch (error) {
      await rateLimitUnresolvedDocumentUpload(
        context,
        input.rateLimiter,
        input.uploadConfig.rateLimitPerMinute,
      );
      throw error;
    }

    const actor = sessionResult.payload;
    setAuthenticatedContext(context, actor);

    await rateLimitDocumentUpload(
      context,
      input.rateLimiter,
      actor,
      input.uploadConfig.rateLimitPerMinute,
    );

    const params = input.paramsSchema.safeParse(context.req.param());
    if (!params.success) {
      throw validationError({
        domain: "api",
        reason: "invalid_path_params",
        message: "请检查填写内容。",
        validationErrors: params.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    const reservationResult = input.uploadConcurrencyLimiter.acquire({
      actorKey: `${actor.tenant.id}:${actor.user.id}`,
      actorLimit: input.uploadConfig.concurrencyPerActor,
      tenantKey: actor.tenant.id,
      tenantLimit: input.uploadConfig.concurrencyPerTenant,
    });
    if (!reservationResult.ok) {
      throw rateLimited({
        domain: "api",
        reason:
          reservationResult.scope === "actor"
            ? "upload_actor_concurrency_limited"
            : "upload_tenant_concurrency_limited",
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
