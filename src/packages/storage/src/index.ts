import { z } from "zod";

export const objectStorageConfigSchema = z.object({
  endpoint: z.string().url(),
  bucket: z.string().min(1),
  region: z.string().min(1).default("local"),
});

export type ObjectStorageConfig = z.infer<typeof objectStorageConfigSchema>;

const unsafeFilenameCharacters = /[^A-Za-z0-9._-]+/g;
const repeatedDashes = /-+/g;

export function sanitizeObjectFilename(fileName: string): string {
  const rawBaseName = fileName.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const normalized = rawBaseName
    .normalize("NFKC")
    .replaceAll("\u0000", "")
    .replace(unsafeFilenameCharacters, "-")
    .replace(repeatedDashes, "-")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "");

  if (!normalized) {
    throw new Error("Invalid object filename");
  }

  return normalized;
}

export function createDocumentObjectKey(input: {
  tenantId: string;
  documentId: string;
  fileName: string;
}): string {
  const safeFileName = sanitizeObjectFilename(input.fileName);

  return `tenants/${input.tenantId}/documents/${input.documentId}/${safeFileName}`;
}
