import type { Hono } from "hono";

import {
  createUserInputSchema,
  listUsersQuerySchema,
  updateUserInputSchema,
} from "@kb/users";

import type {
  ApiEnv,
  ApiRateLimiter,
  AuditService,
  AuthService,
  UserService,
} from "./contracts";
import { createSuccessResponse, hasRequestBody, readJsonBody } from "./http";
import {
  requireAdminUserManagementSession,
  respondAfterUnresolvedUserManagementRateLimit,
} from "./session-guards";
import { respondWithError } from "./http";
import {
  respondWithServiceError,
  respondWithValidationError,
  validateJsonMutationRequest,
  validateMutationRequest,
} from "./request-helpers";

export function registerUserRoutes(
  app: Hono<ApiEnv>,
  input: {
    allowedOrigins: string[];
    auditService: AuditService;
    authService: AuthService;
    rateLimiter: ApiRateLimiter;
    userService: UserService;
  },
): void {
  app.get("/api/users", async (context) => {
    const authResult = await requireAdminUserManagementSession(
      context,
      input.auditService,
      input.authService,
      input.rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const query = listUsersQuerySchema.parse(
      Object.fromEntries(new URL(context.req.url).searchParams),
    );
    const result = await input.userService.listUsers({
      actor: authResult.actor,
      query,
    });
    if (!result.ok) {
      return respondWithError(context, {
        code: result.code,
        httpStatus: result.httpStatus,
        message: result.message,
      });
    }

    return context.json(
      createSuccessResponse({
        data: result.page,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.post("/api/users", async (context) => {
    const csrfResponse = validateJsonMutationRequest(context, input.allowedOrigins);
    if (csrfResponse !== null) {
      return respondAfterUnresolvedUserManagementRateLimit(
        context,
        input.rateLimiter,
        csrfResponse,
      );
    }

    const authResult = await requireAdminUserManagementSession(
      context,
      input.auditService,
      input.authService,
      input.rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const body = await readJsonBody(context.req.raw);
    const parsed = createUserInputSchema.safeParse(body);
    if (!parsed.success) {
      return respondWithValidationError(context, parsed.error);
    }

    const result = await input.userService.createUser({
      actor: authResult.actor,
      body: parsed.data,
    });
    if (!result.ok) {
      return respondWithServiceError(context, result);
    }

    return context.json(
      createSuccessResponse({
        data: result.user,
        httpStatus: 201,
        requestId: context.get("requestId"),
      }),
      201,
    );
  });

  app.get("/api/users/:userId", async (context) => {
    const authResult = await requireAdminUserManagementSession(
      context,
      input.auditService,
      input.authService,
      input.rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const result = await input.userService.getUser({
      actor: authResult.actor,
      userId: context.req.param("userId"),
    });
    if (!result.ok) {
      return respondWithServiceError(context, result);
    }

    return context.json(
      createSuccessResponse({
        data: result.user,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.patch("/api/users/:userId", async (context) => {
    const csrfResponse = validateJsonMutationRequest(context, input.allowedOrigins);
    if (csrfResponse !== null) {
      return respondAfterUnresolvedUserManagementRateLimit(
        context,
        input.rateLimiter,
        csrfResponse,
      );
    }

    const authResult = await requireAdminUserManagementSession(
      context,
      input.auditService,
      input.authService,
      input.rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const body = await readJsonBody(context.req.raw);
    const parsed = updateUserInputSchema.safeParse(body);
    if (!parsed.success) {
      return respondWithValidationError(context, parsed.error);
    }

    const result = await input.userService.updateUser({
      actor: authResult.actor,
      body: parsed.data,
      userId: context.req.param("userId"),
    });
    if (!result.ok) {
      return respondWithServiceError(context, result);
    }

    return context.json(
      createSuccessResponse({
        data: result.user,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });

  app.delete("/api/users/:userId/access", async (context) => {
    const csrfResponse = validateMutationRequest(context, input.allowedOrigins);
    if (csrfResponse !== null) {
      return respondAfterUnresolvedUserManagementRateLimit(
        context,
        input.rateLimiter,
        csrfResponse,
      );
    }

    if (hasRequestBody(context.req.raw)) {
      return respondAfterUnresolvedUserManagementRateLimit(
        context,
        input.rateLimiter,
        respondWithError(context, {
          code: "VALIDATION_ERROR",
          httpStatus: 400,
          message: "请检查填写内容。",
        }),
      );
    }

    const authResult = await requireAdminUserManagementSession(
      context,
      input.auditService,
      input.authService,
      input.rateLimiter,
    );
    if (!authResult.ok) {
      return authResult.response;
    }

    const result = await input.userService.removeUserAccess({
      actor: authResult.actor,
      userId: context.req.param("userId"),
    });
    if (!result.ok) {
      return respondWithServiceError(context, result);
    }

    return context.json(
      createSuccessResponse({
        data: null,
        httpStatus: 200,
        requestId: context.get("requestId"),
      }),
      200,
    );
  });
}
