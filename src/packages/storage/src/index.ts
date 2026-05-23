import { z } from "zod";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const objectStorageConfigSchema = z.object({
  endpoint: z.string().url(),
  bucket: z.string().min(1),
  region: z.string().min(1).default("local"),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  forcePathStyle: z.boolean().default(true),
});

export type ObjectStorageConfig = z.infer<typeof objectStorageConfigSchema>;

export type ObjectKeyKind = "source" | "normalized" | "derived" | "temp";

export interface PutObjectInput {
  bucket: string;
  key: string;
  body: Uint8Array;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface DeleteObjectInput {
  bucket: string;
  key: string;
}

export interface ObjectStorageClient {
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
}

const safeMetadataValuePattern = /^[\u0020-\u007E]*$/;

export function normalizeObjectMetadata(
  metadata: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      safeMetadataValuePattern.test(value) ? value : encodeURIComponent(value),
    ]),
  );
}

export function createS3ObjectStorageClient(
  configInput: ObjectStorageConfig,
): ObjectStorageClient {
  const config = objectStorageConfigSchema.parse(configInput);
  const client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
  });

  return {
    async putObject(input) {
      await client.send(
        new PutObjectCommand({
          Body: input.body,
          Bucket: input.bucket,
          Key: input.key,
          ...(input.contentType === undefined ? {} : { ContentType: input.contentType }),
          ...(input.metadata === undefined
            ? {}
            : { Metadata: normalizeObjectMetadata(input.metadata) }),
        }),
      );
    },
    async deleteObject(input) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
        }),
      );
    },
  };
}

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
  knowledgeBaseId: string;
  documentId: string;
  documentVersion: number;
  fileName: string;
  kind?: Extract<ObjectKeyKind, "source" | "normalized" | "derived">;
}): string {
  const safeFileName = sanitizeObjectFilename(input.fileName);
  const kind = input.kind ?? "source";

  return `tenants/${input.tenantId}/knowledge-bases/${input.knowledgeBaseId}/documents/${input.documentId}/versions/${input.documentVersion}/${kind}/${safeFileName}`;
}
