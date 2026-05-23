import { describe, expect, it } from "vitest";

import {
  createKnowledgeBaseInputSchema,
  documentStatusSchema,
  knowledgeBaseDetailSchema,
  knowledgeBaseListQuerySchema,
  knowledgeBaseScopeSchema,
  normalizeKnowledgeBaseMemberIds,
  normalizeKnowledgeBaseName,
  updateKnowledgeBaseInputSchema,
} from "./index";

describe("@kb/knowledge", () => {
  it("defines knowledge-base authorization scope identifiers", () => {
    expect(
      knowledgeBaseScopeSchema.parse({
        tenantId: "tenant_1",
        knowledgeBaseId: "kb_1",
      }),
    ).toEqual({
      tenantId: "tenant_1",
      knowledgeBaseId: "kb_1",
    });
  });

  it("includes ingestion-facing document statuses", () => {
    expect(documentStatusSchema.parse("processing")).toBe("processing");
  });

  it("normalizes list query defaults and allowed page sizes", () => {
    expect(knowledgeBaseListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 8,
      sort: "updated",
    });

    expect(
      knowledgeBaseListQuerySchema.parse({
        page: "2",
        pageSize: "12",
        search: " 合同 ",
        sort: "name",
      }),
    ).toEqual({
      page: 2,
      pageSize: 12,
      search: "合同",
      sort: "name",
    });

    expect(knowledgeBaseListQuerySchema.parse({ pageSize: "100" }).pageSize).toBe(8);
  });

  it("trims create and update inputs without requiring members", () => {
    expect(
      createKnowledgeBaseInputSchema.parse({
        description: "  供应商资料  ",
        memberIds: [],
        name: "  采购知识库  ",
      }),
    ).toEqual({
      description: "供应商资料",
      memberIds: [],
      name: "采购知识库",
    });

    expect(
      updateKnowledgeBaseInputSchema.parse({
        description: "",
        memberIds: ["member_1", "member_1", "member_2"],
        name: " 合同库 ",
      }),
    ).toEqual({
      description: null,
      memberIds: ["member_1", "member_2"],
      name: "合同库",
    });

    expect(updateKnowledgeBaseInputSchema.parse({ name: " 仅改名 " })).toEqual({
      name: "仅改名",
    });
  });

  it("normalizes member ids and case-insensitive names for uniqueness checks", () => {
    expect(normalizeKnowledgeBaseMemberIds([" member_1 ", "member_2", "member_1"])).toEqual([
      "member_1",
      "member_2",
    ]);
    expect(normalizeKnowledgeBaseName("  Procurement KB  ")).toBe("procurement kb");
  });

  it("does not expose slug or visibility in API detail schemas", () => {
    const parsed = knowledgeBaseDetailSchema.parse({
      createdAt: "2026-05-18T00:00:00.000Z",
      description: null,
      documentCount: 0,
      id: "kb_1",
      memberCount: 0,
      members: [],
      name: "采购知识库",
      updatedAt: "2026-05-18T00:00:00.000Z",
    });

    expect(parsed).not.toHaveProperty("slug");
    expect(parsed).not.toHaveProperty("visibility");
  });
});
