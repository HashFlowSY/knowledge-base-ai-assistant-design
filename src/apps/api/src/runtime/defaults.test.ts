import { describe, expect, it } from "vitest";

import { isAppError } from "@kb/errors";

import { createDefaultApiApp } from "../app";
import { adminSession } from "../testing/fakes";
import {
  createEmptyDocumentService,
  createEmptyKnowledgeBaseService,
  createEmptyUserService,
  createUnauthenticatedAuthService,
} from "./defaults";

describe("api runtime defaults", () => {
  it("keeps default service stubs available through an internal module boundary", async () => {
    const authService = createUnauthenticatedAuthService();
    const documentService = createEmptyDocumentService();
    const knowledgeBaseService = createEmptyKnowledgeBaseService();
    const userService = createEmptyUserService();

    await expect(
      authService.getSession({ cookieHeader: null }),
    ).rejects.toMatchObject({
      data: {
        code: "UNAUTHORIZED",
        domain: "auth",
        httpStatus: 401,
        reason: "missing_session",
        message: "请先登录。",
      },
    });
    const userError = await userService
      .createUser({
        actor: adminSession,
        body: {
          name: "成员",
          email: "member@example.com",
          role: "member",
          password: "password123",
        },
      })
      .catch((error: unknown) => error);

    if (!isAppError(userError)) {
      throw new Error("Expected createUser default to reject with AppError.");
    }

    expect(userError.data).toMatchObject({
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      domain: "api",
      reason: "not_implemented",
      message: "操作失败，请稍后重试。",
    });
    await expect(
      knowledgeBaseService.createKnowledgeBase({
        actor: {
          role: "admin",
          tenant: { id: "tenant_1" },
          user: { id: "admin_1" },
        },
        body: { description: null, memberIds: [], name: "知识库" },
      }),
    ).rejects.toMatchObject({
      data: {
        code: "INTERNAL_ERROR",
        domain: "api",
        reason: "not_implemented",
      },
    });
    await expect(
      documentService.retryDocumentProcessing({
        actor: {
          role: "admin",
          tenant: { id: "tenant_1" },
          user: { id: "admin_1" },
        },
        documentId: "doc_1",
        knowledgeBaseId: "kb_1",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "INTERNAL_ERROR",
        domain: "api",
        reason: "not_implemented",
      },
    });
  });

  it("fails fast when default runtime configuration is invalid", () => {
    expect(() => createDefaultApiApp({ NODE_ENV: "production" })).toThrow();
  });
});
