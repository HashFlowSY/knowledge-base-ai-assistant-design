import { z } from "zod";

export const serviceNameSchema = z.enum(["web", "api", "worker"]);

export type ServiceName = z.infer<typeof serviceNameSchema>;

export const isoTimestampSchema = z.string().datetime();

export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;

export const apiValidationErrorSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string().min(1),
});

export type ApiValidationError = z.infer<typeof apiValidationErrorSchema>;

export const emptyPayloadSchema = z.null();

export type EmptyPayload = z.infer<typeof emptyPayloadSchema>;

export const apiErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export function apiSuccessResponseSchema<T extends z.ZodTypeAny>(
  dataSchema: T,
): z.ZodObject<{
  success: z.ZodLiteral<true>;
  httpStatus: z.ZodNumber;
  data: T;
  requestId: z.ZodString;
}> {
  return z.object({
    success: z.literal(true),
    httpStatus: z.number().int().min(200).max(299),
    data: dataSchema,
    requestId: z.string().min(1),
  });
}

export interface ApiSuccessResponse<T> {
  success: true;
  httpStatus: number;
  data: T;
  requestId: string;
}

export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  httpStatus: z.number().int().min(400).max(599),
  code: apiErrorCodeSchema,
  message: z.string().min(1),
  requestId: z.string().min(1),
  validationErrors: z.array(apiValidationErrorSchema).optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export function pageResultSchema<T extends z.ZodTypeAny>(
  itemSchema: T,
): z.ZodObject<{
  items: z.ZodArray<T>;
  page: z.ZodNumber;
  pageSize: z.ZodNumber;
  total: z.ZodNumber;
}> {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  });
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function createUtcTimestamp(now: Date = new Date()): IsoTimestamp {
  return isoTimestampSchema.parse(now.toISOString());
}
