import { z } from "zod";

export const objectStorageConfigSchema = z.object({
  endpoint: z.string().url(),
  bucket: z.string().min(1),
  region: z.string().min(1).default("local"),
});

export type ObjectStorageConfig = z.infer<typeof objectStorageConfigSchema>;

export function createDocumentObjectKey(input: {
  tenantId: string;
  documentId: string;
  fileName: string;
}): string {
  return `tenants/${input.tenantId}/documents/${input.documentId}/${input.fileName}`;
}
