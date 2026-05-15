import { z } from "zod";
import { isIP } from "node:net";

export const queueNameSchema = z.enum(["ingestion", "maintenance"]);

export type QueueName = z.infer<typeof queueNameSchema>;

export const systemJobActorSchema = z.object({
  actorType: z.literal("system"),
  requestedBy: z.null().optional(),
});

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first = 0, second = 0, third = 0] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isPrivateIpv4MappedIpv6(hostname: string): boolean {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(hostname);
  if (!match) {
    return false;
  }

  const [, high = "", low = ""] = match;
  const highValue = Number.parseInt(high, 16);
  const lowValue = Number.parseInt(low, 16);
  const mappedIpv4 = [
    highValue >> 8,
    highValue & 0xff,
    lowValue >> 8,
    lowValue & 0xff,
  ].join(".");

  return isPrivateIpv4(mappedIpv4);
}

function isPrivateIpv6(hostname: string): boolean {
  return (
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("2001:db8") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80") ||
    hostname.startsWith("fec0") ||
    hostname.startsWith("ff") ||
    isPrivateIpv4MappedIpv6(hostname)
  );
}

function normalizeUrlHostname(hostname: string): string {
  const withoutTrailingDots = hostname.toLowerCase().replace(/\.+$/, "");
  return withoutTrailingDots.startsWith("[") && withoutTrailingDots.endsWith("]")
    ? withoutTrailingDots.slice(1, -1)
    : withoutTrailingDots;
}

function isBlockedUrlHost(hostname: string): boolean {
  const normalized = normalizeUrlHostname(hostname);
  const ipVersion = isIP(normalized);

  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(normalized);
  }

  return normalized === "localhost" || normalized.endsWith(".localhost");
}

export const sourceUrlSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL protocol is not allowed",
      });
      return;
    }

    if (isBlockedUrlHost(url.hostname)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL host is not allowed",
      });
    }
  });

export const ingestionJobPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file_ingestion"),
    tenantId: z.string().min(1),
    knowledgeBaseId: z.string().min(1),
    documentId: z.string().min(1),
    documentVersion: z.string().min(1),
    sourceObjectKey: z.string().min(1),
    requestedBy: z.string().min(1),
  }),
  z.object({
    type: z.literal("url_ingestion"),
    tenantId: z.string().min(1),
    knowledgeBaseId: z.string().min(1),
    documentId: z.string().min(1),
    documentVersion: z.string().min(1),
    sourceUrl: sourceUrlSchema,
    requestedBy: z.string().min(1),
  }),
]);

export type IngestionJobPayload = z.infer<typeof ingestionJobPayloadSchema>;

export function createIngestionJobId(payload: IngestionJobPayload): string {
  return `ingestion:${payload.tenantId}:${payload.documentId}:${payload.documentVersion}`;
}
