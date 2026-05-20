import { z } from "zod";

import { normalizeEmail, roleSchema } from "@kb/auth";
import { isoTimestampSchema, pageResultSchema } from "@kb/shared";

const trimmedNonEmptyStringSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1));

const normalizedEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => normalizeEmail(value));

const optionalPasswordUpdateSchema = z.union([z.string(), z.null()]).optional();

export const userSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
    role: roleSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export type UserSummary = z.infer<typeof userSummarySchema>;

export const usersPageSchema = pageResultSchema(userSummarySchema);

export type UsersPage = z.infer<typeof usersPageSchema>;

export const listUsersQuerySchema = z
  .object({
    page: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => parsePositiveInteger(value, 1)),
    pageSize: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        const parsed = parsePositiveInteger(value, 8);
        return [5, 8, 12].includes(parsed) ? parsed : 8;
      }),
    search: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        return trimmed.length > 0 ? trimmed : undefined;
      }),
    filter: z
      .string()
      .optional()
      .transform((value) => (value === "admin" || value === "member" ? value : "all")),
    sort: z
      .string()
      .optional()
      .transform((value) => (value === "name" ? "name" : "updated")),
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.pageSize,
    filter: value.filter,
    sort: value.sort,
    ...(value.search === undefined ? {} : { search: value.search }),
  }));

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const createUserInputSchema = z
  .object({
    name: trimmedNonEmptyStringSchema,
    email: normalizedEmailSchema,
    role: roleSchema,
    password: z.string().refine((value) => value.trim().length > 0, {
      message: "Password is required",
    }),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z
  .object({
    name: trimmedNonEmptyStringSchema.optional(),
    email: normalizedEmailSchema.optional(),
    role: roleSchema.optional(),
    password: optionalPasswordUpdateSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.role !== undefined ||
      Object.hasOwn(value, "password"),
    {
      message: "At least one supported field is required",
    },
  )
  .transform((value) => ({
    ...value,
    ...(Object.hasOwn(value, "password")
      ? { password: normalizePasswordUpdate(value.password) }
      : {}),
  }));

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

function parsePositiveInteger(
  value: string | number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePasswordUpdate(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return value.trim().length === 0 ? null : value;
}
