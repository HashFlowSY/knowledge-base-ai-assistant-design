import { describe, expect, it, vi } from "vitest";

import type { ProjectDb } from "@kb/db";
import { isAppError } from "@kb/errors";

import { getKnowledgeBaseOperation } from "../operations/knowledge-bases/get";
import { createNotFoundError } from "./errors";

describe("knowledge service errors", () => {
  it("maps missing knowledge bases to the shared AppError contract", () => {
    const error = createNotFoundError();

    expect(isAppError(error)).toBe(true);
    expect(error.data).toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
      domain: "knowledge",
      reason: "knowledge_base_not_found",
      message: "知识库不存在或无权访问。",
    });
  });

  it("throws AppError when a requested visible knowledge base is missing", async () => {
    await expect(
      getKnowledgeBaseOperation(
        { db: createVisibleKnowledgeBaseSelectMock([]) },
        {
          actor: {
            role: "admin",
            tenant: { id: "tenant_1" },
            user: { id: "admin_1" },
          },
          knowledgeBaseId: "kb_missing",
        },
      ),
    ).rejects.toMatchObject({
      data: {
        code: "NOT_FOUND",
        httpStatus: 404,
        domain: "knowledge",
        reason: "knowledge_base_not_found",
      },
    });
  });
});

function createVisibleKnowledgeBaseSelectMock(rows: unknown[]): ProjectDb {
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => rows),
      })),
    })),
  }));

  return { select } as unknown as ProjectDb;
}
