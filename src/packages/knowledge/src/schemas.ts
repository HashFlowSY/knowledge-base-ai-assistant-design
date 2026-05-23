import { z } from "zod";

import { isoTimestampSchema, pageResultSchema } from "@kb/shared";

const trimmedNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(200));

const descriptionSchema = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const memberIdsSchema = z
  .array(z.string().transform((value) => value.trim()).pipe(z.string().min(1)))
  .transform((value) => normalizeKnowledgeBaseMemberIds(value));

export const knowledgeBaseMemberSummarySchema = z
  .object({
    email: z.string().email(),
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

export type KnowledgeBaseMemberSummary = z.infer<
  typeof knowledgeBaseMemberSummarySchema
>;

export const knowledgeBaseSummarySchema = z
  .object({
    createdAt: isoTimestampSchema,
    description: z.string().nullable(),
    documentCount: z.number().int().min(0),
    id: z.string().min(1),
    memberCount: z.number().int().min(0),
    members: z.array(knowledgeBaseMemberSummarySchema),
    name: z.string().min(1),
    updatedAt: isoTimestampSchema,
  })
  .strict();

export type KnowledgeBaseSummary = z.infer<typeof knowledgeBaseSummarySchema>;

export const knowledgeBaseDetailSchema = knowledgeBaseSummarySchema;

export type KnowledgeBaseDetail = z.infer<typeof knowledgeBaseDetailSchema>;

export const knowledgeBasesPageSchema = pageResultSchema(knowledgeBaseSummarySchema);

export type KnowledgeBasesPage = z.infer<typeof knowledgeBasesPageSchema>;

export const knowledgeBaseListQuerySchema = z
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
    sort: z
      .string()
      .optional()
      .transform((value) => (value === "name" ? "name" : "updated")),
  })
  .transform((value) => ({
    page: value.page,
    pageSize: value.pageSize,
    sort: value.sort,
    ...(value.search === undefined ? {} : { search: value.search }),
  }));

export type KnowledgeBaseListQuery = z.infer<typeof knowledgeBaseListQuerySchema>;

export const createKnowledgeBaseInputSchema = z
  .object({
    description: descriptionSchema.optional().default(null),
    memberIds: memberIdsSchema.optional().default([]),
    name: trimmedNameSchema,
  })
  .strict();

export type CreateKnowledgeBaseInput = z.infer<
  typeof createKnowledgeBaseInputSchema
>;

export const updateKnowledgeBaseInputSchema = z
  .object({
    description: descriptionSchema.optional(),
    memberIds: memberIdsSchema.optional(),
    name: trimmedNameSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      Object.hasOwn(value, "description") ||
      Object.hasOwn(value, "memberIds"),
    {
      message: "At least one supported field is required",
    },
  );

export type UpdateKnowledgeBaseInput = z.infer<
  typeof updateKnowledgeBaseInputSchema
>;

export function normalizeKnowledgeBaseMemberIds(memberIds: string[]): string[] {
  const normalized = new Set<string>();

  for (const memberId of memberIds) {
    const trimmed = memberId.trim();
    if (trimmed.length > 0) {
      normalized.add(trimmed);
    }
  }

  return Array.from(normalized);
}

export function normalizeKnowledgeBaseName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

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
