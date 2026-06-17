import { describe, expect, it, vi } from "vitest";

import type {
  KnowledgeBaseService as PackageKnowledgeBaseService,
  KnowledgeActor,
} from "@kb/knowledge/service";

import { createKnowledgeServiceAdapters } from "./knowledge-adapter";

const knowledgeActor = {
  user: { id: "admin_1" },
  tenant: { id: "tenant_1" },
  role: "admin" as const,
} satisfies KnowledgeActor;

describe("knowledge service adapters", () => {
  it("passes narrow knowledge actors to the package knowledge-base service", async () => {
    const capturedActors: KnowledgeActor[] = [];
    const packageService: PackageKnowledgeBaseService = {
      async createKnowledgeBase(input) {
        capturedActors.push(input.actor);
        return {
          ok: true,
          knowledgeBase: {
            createdAt: "2026-05-25T00:00:00.000Z",
            description: null,
            documentCount: 0,
            id: "kb_1",
            memberCount: 0,
            members: [],
            name: input.body.name,
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
        };
      },
      getKnowledgeBase: vi.fn(),
      listDocumentProcessing: vi.fn(),
      listKnowledgeBases: vi.fn(),
      retryDocumentProcessing: vi.fn(),
      uploadDocumentFile: vi.fn(),
      updateKnowledgeBase: vi.fn(),
    };

    const { knowledgeBaseService } = createKnowledgeServiceAdapters(packageService);

    await knowledgeBaseService.createKnowledgeBase({
      actor: knowledgeActor,
      body: {
        description: null,
        memberIds: [],
        name: "Policies",
      },
    });

    expect(capturedActors).toEqual([
      {
        role: "admin",
        tenant: { id: "tenant_1" },
        user: { id: "admin_1" },
      },
    ]);
  });

  it("passes narrow knowledge actors to the package document service", async () => {
    const capturedActors: KnowledgeActor[] = [];
    const packageService: PackageKnowledgeBaseService = {
      createKnowledgeBase: vi.fn(),
      getKnowledgeBase: vi.fn(),
      listDocumentProcessing: vi.fn(),
      listKnowledgeBases: vi.fn(),
      retryDocumentProcessing: vi.fn(),
      async uploadDocumentFile(input) {
        capturedActors.push(input.actor);
        const timestamp = "2026-05-25T00:00:00.000Z";
        return {
          ok: true,
          result: {
            document: {
              createdAt: timestamp,
              currentVersion: 1,
              id: "doc_1",
              knowledgeBaseId: input.knowledgeBaseId,
              status: "pending",
              title: input.title,
              updatedAt: timestamp,
            },
            duplicate: false,
            job: {
              createdAt: timestamp,
              documentId: "doc_1",
              id: "job_1",
              knowledgeBaseId: input.knowledgeBaseId,
              queuedAt: timestamp,
              sourceHash: input.checksum,
              sourceType: "file",
              status: "queued",
              updatedAt: timestamp,
            },
            source: {
              bucket: "kb-source",
              documentId: "doc_1",
              id: "source_1",
              mimeType: input.mimeType,
              objectKey: "tenants/tenant_1/knowledge-bases/kb_1/documents/doc_1/versions/1/source/notes.txt",
              scanStatus: "not_scanned",
              sizeBytes: input.sizeBytes,
              sourceHash: input.checksum,
              sourceType: "file",
              sourceUri: input.originalFilename,
              uploadedAt: timestamp,
              uploadStatus: "available",
            },
          },
        };
      },
      updateKnowledgeBase: vi.fn(),
    };

    const { documentService } = createKnowledgeServiceAdapters(packageService);

    await documentService.uploadDocumentFile({
      actor: knowledgeActor,
      checksum: "sha256:abc",
      content: new Uint8Array([1, 2, 3]),
      ipSummary: "203.0.113.0/24",
      knowledgeBaseId: "kb_1",
      mimeType: "text/plain",
      originalFilename: "notes.txt",
      requestId: "req_1",
      sizeBytes: 3,
      title: "Notes",
      userAgentSummary: "vitest",
    });

    expect(capturedActors).toEqual([
      {
        role: "admin",
        tenant: { id: "tenant_1" },
        user: { id: "admin_1" },
      },
    ]);
  });

  it("passes paginated document processing queries through the document adapter", async () => {
    const packageService: PackageKnowledgeBaseService = {
      createKnowledgeBase: vi.fn(),
      getKnowledgeBase: vi.fn(),
      async listDocumentProcessing(input) {
        expect(input).toEqual({
          actor: {
            role: "admin",
            tenant: { id: "tenant_1" },
            user: { id: "admin_1" },
          },
          knowledgeBaseId: "kb_1",
          query: {
            page: 2,
            pageSize: 5,
          },
        });
        return {
          ok: true,
          page: {
            items: [],
            page: 2,
            pageSize: 5,
            total: 0,
          },
        };
      },
      listKnowledgeBases: vi.fn(),
      retryDocumentProcessing: vi.fn(),
      uploadDocumentFile: vi.fn(),
      updateKnowledgeBase: vi.fn(),
    };

    const { documentService } = createKnowledgeServiceAdapters(packageService);

    await documentService.listDocumentProcessing({
      actor: knowledgeActor,
      knowledgeBaseId: "kb_1",
      query: {
        page: 2,
        pageSize: 5,
      },
    });
  });
});
