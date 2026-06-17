import { z } from "zod";

import {
  apiErrorCodeSchema,
  apiValidationErrorSchema,
  type ApiErrorCode,
} from "@kb/shared";

export const appErrorDomainSchema = z.enum([
  "api",
  "auth",
  "users",
  "knowledge",
  "documents",
  "providers",
  "rag",
  "ingestion",
  "worker",
  "queue",
  "search",
  "storage",
  "db",
  "security",
  "audit",
]);

export type AppErrorDomain = z.infer<typeof appErrorDomainSchema>;

export const appErrorReasonSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);

export type AppErrorReason = z.infer<typeof appErrorReasonSchema>;

const systemGeneratedIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

const apiRoutePathSchema = z
  .string()
  .min(1)
  .regex(/^\/api(?:\/[A-Za-z0-9:_-]+)*\/?$/)
  .refine((value) => !value.includes("?"), {
    message: "Route path must not include a query string.",
  });

const hasHttpHeaderControlCharacter = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    if (charCode <= 0x1f || charCode === 0x7f) {
      return true;
    }
  }

  return false;
};

const authSetCookieHeaderSchema = z
  .string()
  .min(1)
  .refine((value) => !hasHttpHeaderControlCharacter(value), {
    message: "setCookie must not contain HTTP header control characters.",
  })
  .refine((value) => /^better-auth\.[A-Za-z0-9_-]+=/.test(value), {
    message: "setCookie is limited to Better Auth cookie headers.",
  });

export const appErrorMetadataSchema = z
  .object({
    requestId: systemGeneratedIdSchema.optional(),
    tenantId: systemGeneratedIdSchema.optional(),
    actorId: systemGeneratedIdSchema.optional(),
    targetUserId: systemGeneratedIdSchema.optional(),
    knowledgeBaseId: systemGeneratedIdSchema.optional(),
    documentId: systemGeneratedIdSchema.optional(),
    documentSourceId: systemGeneratedIdSchema.optional(),
    ingestionJobId: systemGeneratedIdSchema.optional(),
    providerConfigId: systemGeneratedIdSchema.optional(),
    retrievalRunId: systemGeneratedIdSchema.optional(),
    queueName: z.enum(["ingestion", "maintenance"]).optional(),
    jobId: systemGeneratedIdSchema.optional(),
    operation: appErrorReasonSchema.optional(),
    path: apiRoutePathSchema.optional(),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
      .optional(),
    contentLength: z.number().int().min(0).optional(),
    maxBytes: z.number().int().min(0).optional(),
    retryAttempt: z.number().int().min(0).optional(),
  })
  .strict();

export type AppErrorMetadata = z.infer<typeof appErrorMetadataSchema>;

export const appErrorResponseHeadersSchema = z
  .object({
    retryAfterSeconds: z.number().int().min(1).max(86_400).optional(),
    setCookie: z.array(authSetCookieHeaderSchema).min(1).optional(),
  })
  .strict();

export type AppErrorResponseHeaders = z.infer<
  typeof appErrorResponseHeadersSchema
>;

const httpStatusByCode = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PROVIDER_UNAVAILABLE: 500,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ApiErrorCode, number>;

export const appErrorDataSchema = z
  .object({
    code: apiErrorCodeSchema,
    httpStatus: z.union([
      z.literal(400),
      z.literal(401),
      z.literal(403),
      z.literal(404),
      z.literal(409),
      z.literal(413),
      z.literal(415),
      z.literal(429),
      z.literal(500),
    ]),
    message: z.string().min(1),
    validationErrors: z.array(apiValidationErrorSchema).optional(),
    domain: appErrorDomainSchema,
    reason: appErrorReasonSchema,
    retryable: z.boolean().optional(),
    metadata: appErrorMetadataSchema.optional(),
    responseHeaders: appErrorResponseHeadersSchema.optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.httpStatus !== httpStatusByCode[data.code]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `HTTP status ${data.httpStatus} does not match ${data.code}.`,
        path: ["httpStatus"],
      });
    }

    if (
      data.responseHeaders?.retryAfterSeconds !== undefined &&
      data.code !== "RATE_LIMITED"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "retryAfterSeconds is only allowed on RATE_LIMITED errors.",
        path: ["responseHeaders", "retryAfterSeconds"],
      });
    }

    if (
      data.responseHeaders?.setCookie !== undefined &&
      data.domain !== "auth"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "setCookie is only allowed on auth domain errors.",
        path: ["responseHeaders", "setCookie"],
      });
    }
  });

export type AppErrorData = z.infer<typeof appErrorDataSchema>;

export interface AppErrorOptions {
  cause?: unknown;
}

export class AppError extends Error {
  readonly data: AppErrorData;

  constructor(data: AppErrorData, options: AppErrorOptions = {}) {
    const parsed = appErrorDataSchema.parse(data);
    super(parsed.message, options);
    this.name = "AppError";
    this.data = parsed;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function createAppError(
  data: AppErrorData,
  options?: AppErrorOptions,
): AppError {
  return new AppError(data, options);
}

interface FactoryInput {
  domain: AppErrorDomain;
  reason: AppErrorReason;
  message?: string;
  metadata?: AppErrorMetadata;
  retryable?: boolean;
  responseHeaders?: AppErrorResponseHeaders;
}

function createStandardError(
  input: FactoryInput & {
    code: ApiErrorCode;
    defaultMessage: string;
    httpStatus: AppErrorData["httpStatus"];
    validationErrors?: AppErrorData["validationErrors"];
  },
  options?: AppErrorOptions,
): AppError {
  return createAppError(
    {
      code: input.code,
      httpStatus: input.httpStatus,
      message: input.message ?? input.defaultMessage,
      domain: input.domain,
      reason: input.reason,
      ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(input.responseHeaders === undefined
        ? {}
        : { responseHeaders: input.responseHeaders }),
      ...(input.validationErrors === undefined
        ? {}
        : { validationErrors: input.validationErrors }),
    },
    options,
  );
}

export function unauthorized(
  input: FactoryInput,
  options?: AppErrorOptions,
): AppError {
  return createStandardError(
    {
      ...input,
      code: "UNAUTHORIZED",
      httpStatus: 401,
      defaultMessage: "请先登录。",
    },
    options,
  );
}

export function forbidden(
  input: FactoryInput,
  options?: AppErrorOptions,
): AppError {
  return createStandardError(
    {
      ...input,
      code: "FORBIDDEN",
      httpStatus: 403,
      defaultMessage: "你没有权限执行此操作。",
    },
    options,
  );
}

export function notFound(
  input: FactoryInput,
  options?: AppErrorOptions,
): AppError {
  return createStandardError(
    {
      ...input,
      code: "NOT_FOUND",
      httpStatus: 404,
      defaultMessage: "资源不存在或无权访问。",
    },
    options,
  );
}

export function conflict(
  input: FactoryInput,
  options?: AppErrorOptions,
): AppError {
  return createStandardError(
    {
      ...input,
      code: "CONFLICT",
      httpStatus: 409,
      defaultMessage: "资源已存在。",
    },
    options,
  );
}

export function validationError(
  input: FactoryInput & {
    validationErrors?: AppErrorData["validationErrors"];
  },
  options?: AppErrorOptions,
): AppError {
  return createStandardError(
    {
      ...input,
      code: "VALIDATION_ERROR",
      httpStatus: 400,
      defaultMessage: "请检查填写内容。",
      validationErrors: input.validationErrors,
    },
    options,
  );
}

export function rateLimited(
  input: Omit<FactoryInput, "responseHeaders"> & {
    retryAfterSeconds?: number;
  },
  options?: AppErrorOptions,
): AppError {
  const responseHeaders =
    input.retryAfterSeconds === undefined
      ? {}
      : { responseHeaders: { retryAfterSeconds: input.retryAfterSeconds } };

  return createStandardError(
    {
      ...input,
      ...responseHeaders,
      code: "RATE_LIMITED",
      httpStatus: 429,
      defaultMessage: "请求过于频繁，请稍后重试。",
    },
    options,
  );
}

export function payloadTooLarge(
  input: FactoryInput,
  options?: AppErrorOptions,
): AppError {
  return createStandardError(
    {
      ...input,
      code: "PAYLOAD_TOO_LARGE",
      httpStatus: 413,
      defaultMessage: "上传内容过大。",
    },
    options,
  );
}

export function unsupportedMediaType(
  input: FactoryInput,
  options?: AppErrorOptions,
): AppError {
  return createStandardError(
    {
      ...input,
      code: "UNSUPPORTED_MEDIA_TYPE",
      httpStatus: 415,
      defaultMessage: "不支持的内容类型。",
    },
    options,
  );
}

export function providerUnavailable(
  input: FactoryInput,
  options?: AppErrorOptions,
): AppError {
  return createStandardError(
    {
      ...input,
      code: "PROVIDER_UNAVAILABLE",
      httpStatus: 500,
      defaultMessage: "模型服务暂时不可用，请稍后重试。",
    },
    options,
  );
}

export function internalError(
  input: FactoryInput,
  options?: AppErrorOptions,
): AppError {
  return createStandardError(
    {
      ...input,
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      defaultMessage: "操作失败，请稍后重试。",
    },
    options,
  );
}

export function normalizeUnknownError(
  error: unknown,
  input: Partial<FactoryInput> = {},
): AppError {
  if (isAppError(error)) {
    return error;
  }

  return internalError(
    {
      domain: input.domain ?? "api",
      reason: input.reason ?? "unexpected_error",
      ...(input.message === undefined ? {} : { message: input.message }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
    },
    { cause: error },
  );
}
