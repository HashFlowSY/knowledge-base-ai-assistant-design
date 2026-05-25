import { describe, expect, it } from "vitest";

import {
  createBullMqConnectionOptions,
  createIngestionJobId,
  createIngestionJobOptions,
  ingestionJobPayloadSchema,
} from "./index";

describe("@kb/queue", () => {
  it("creates stable ingestion job ids", () => {
    const payload = ingestionJobPayloadSchema.parse({
      type: "file_ingestion",
      ingestionJobId: "job_1",
      tenantId: "tenant_1",
      knowledgeBaseId: "kb_1",
      documentId: "doc_1",
      documentVersion: "v1",
      sourceObjectKey: "tenants/tenant_1/documents/doc_1/source.pdf",
      requestedBy: "user_1",
    });

    expect(createIngestionJobId(payload)).toBe("ingestion__tenant_1__doc_1__v1");
    expect(createIngestionJobId(payload)).not.toContain(":");
  });

  it("creates bounded BullMQ options for ingestion jobs", () => {
    const payload = ingestionJobPayloadSchema.parse({
      type: "file_ingestion",
      ingestionJobId: "job_1",
      tenantId: "tenant_1",
      knowledgeBaseId: "kb_1",
      documentId: "doc_1",
      documentVersion: "v1",
      sourceObjectKey: "tenants/tenant_1/documents/doc_1/source.pdf",
      requestedBy: "user_1",
    });

    expect(
      createIngestionJobOptions(payload, {
        attempts: 4,
        backoffMs: 7_500,
      }),
    ).toEqual({
      attempts: 4,
      backoff: {
        delay: 7_500,
        type: "exponential",
      },
      jobId: "ingestion__tenant_1__doc_1__v1",
      removeOnComplete: {
        count: 1_000,
      },
      removeOnFail: {
        count: 5_000,
      },
    });
  });

  it("creates shared BullMQ connection options from Redis URLs", () => {
    expect(
      createBullMqConnectionOptions(
        "redis://worker:secret%20value@localhost:6380/2",
      ),
    ).toEqual({
      db: 2,
      host: "localhost",
      maxRetriesPerRequest: null,
      password: "secret value",
      port: 6380,
      username: "worker",
    });
  });

  it("accepts public HTTPS URL ingestion jobs", () => {
    expect(
      ingestionJobPayloadSchema.parse({
        type: "url_ingestion",
        ingestionJobId: "job_1",
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: "v1",
        sourceUrl: "https://example.com/docs/source.html",
        requestedBy: "user_1",
      }),
    ).toMatchObject({
      sourceUrl: "https://example.com/docs/source.html",
    });
  });

  it("accepts public hostnames that only look like IPv6 private prefixes", () => {
    expect(
      ingestionJobPayloadSchema.parse({
        type: "url_ingestion",
        ingestionJobId: "job_1",
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: "v1",
        sourceUrl: "https://fc00.example.com/docs/source.html",
        requestedBy: "user_1",
      }),
    ).toMatchObject({
      sourceUrl: "https://fc00.example.com/docs/source.html",
    });
  });

  it("rejects localhost URL ingestion jobs before fetchers exist", () => {
    expect(() =>
      ingestionJobPayloadSchema.parse({
        type: "url_ingestion",
        ingestionJobId: "job_1",
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: "v1",
        sourceUrl: "http://127.0.0.1:3000/admin",
        requestedBy: "user_1",
      }),
    ).toThrow("URL host is not allowed");
  });

  it("rejects textual loopback aliases before fetchers exist", () => {
    for (const sourceUrl of [
      "http://0177.0.0.1/admin",
      "http://0x7f000001/admin",
      "http://2130706433/admin",
      "http://127.1/admin",
    ]) {
      expect(() =>
        ingestionJobPayloadSchema.parse({
          type: "url_ingestion",
          ingestionJobId: "job_1",
          tenantId: "tenant_1",
          knowledgeBaseId: "kb_1",
          documentId: "doc_1",
          documentVersion: "v1",
          sourceUrl,
          requestedBy: "user_1",
        }),
      ).toThrow("URL host is not allowed");
    }
  });

  it("rejects private-network URL ingestion jobs before fetchers exist", () => {
    expect(() =>
      ingestionJobPayloadSchema.parse({
        type: "url_ingestion",
        ingestionJobId: "job_1",
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: "v1",
        sourceUrl: "https://10.0.0.8/source",
        requestedBy: "user_1",
      }),
    ).toThrow("URL host is not allowed");
  });

  it("rejects reserved IPv4 URL ingestion jobs before fetchers exist", () => {
    for (const sourceUrl of [
      "https://192.0.2.10/source",
      "https://198.18.0.1/source",
      "https://198.51.100.10/source",
      "https://203.0.113.10/source",
    ]) {
      expect(() =>
        ingestionJobPayloadSchema.parse({
          type: "url_ingestion",
          ingestionJobId: "job_1",
          tenantId: "tenant_1",
          knowledgeBaseId: "kb_1",
          documentId: "doc_1",
          documentVersion: "v1",
          sourceUrl,
          requestedBy: "user_1",
        }),
      ).toThrow("URL host is not allowed");
    }
  });

  it("rejects bracketed local IPv6 URL ingestion jobs before fetchers exist", () => {
    expect(() =>
      ingestionJobPayloadSchema.parse({
        type: "url_ingestion",
        ingestionJobId: "job_1",
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: "v1",
        sourceUrl: "https://[::1]/source",
        requestedBy: "user_1",
      }),
    ).toThrow("URL host is not allowed");
  });

  it("rejects IPv4-mapped IPv6 URL ingestion jobs before fetchers exist", () => {
    expect(() =>
      ingestionJobPayloadSchema.parse({
        type: "url_ingestion",
        ingestionJobId: "job_1",
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: "v1",
        sourceUrl: "https://[::ffff:127.0.0.1]/source",
        requestedBy: "user_1",
      }),
    ).toThrow("URL host is not allowed");
  });

  it("rejects non-public IPv6 literals before fetchers exist", () => {
    for (const sourceUrl of [
      "https://[::]/source",
      "https://[ff02::1]/source",
      "https://[2001:db8::1]/source",
    ]) {
      expect(() =>
        ingestionJobPayloadSchema.parse({
          type: "url_ingestion",
          ingestionJobId: "job_1",
          tenantId: "tenant_1",
          knowledgeBaseId: "kb_1",
          documentId: "doc_1",
          documentVersion: "v1",
          sourceUrl,
          requestedBy: "user_1",
        }),
      ).toThrow("URL host is not allowed");
    }
  });

  it("rejects localhost aliases with trailing dots before fetchers exist", () => {
    expect(() =>
      ingestionJobPayloadSchema.parse({
        type: "url_ingestion",
        ingestionJobId: "job_1",
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: "v1",
        sourceUrl: "https://localhost./source",
        requestedBy: "user_1",
      }),
    ).toThrow("URL host is not allowed");
  });

  it("rejects non-http URL ingestion jobs before fetchers exist", () => {
    expect(() =>
      ingestionJobPayloadSchema.parse({
        type: "url_ingestion",
        ingestionJobId: "job_1",
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
        documentId: "doc_1",
        documentVersion: "v1",
        sourceUrl: "file:///etc/passwd",
        requestedBy: "user_1",
      }),
    ).toThrow("URL protocol is not allowed");
  });
});
