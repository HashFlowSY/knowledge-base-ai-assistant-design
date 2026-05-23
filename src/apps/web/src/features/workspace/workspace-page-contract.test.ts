import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { knowledgeCopy } from "../../copy/knowledge";

function findRepoRoot(start: string): string {
  let current = start;

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, ".trellis"))) {
      return current;
    }
    current = dirname(current);
  }

  throw new Error("Unable to locate repo root for workspace static contract test.");
}

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(findRepoRoot(process.cwd()), relativePath), "utf8");
}

describe("workspace page executable contract", () => {
  it("removes the workspace page from the frontend mock store", () => {
    const workspaceSource = readProjectFile(
      "src/apps/web/src/features/workspace/workspace-mvp-page.tsx",
    );
    const workspaceRouteSource = readProjectFile("src/apps/web/src/app/workspace/page.tsx");

    expect(workspaceSource).not.toContain("features/mock");
    expect(workspaceSource).not.toContain("useMockStore");
    expect(workspaceSource).not.toContain("MockKnowledgeBase");
    expect(workspaceSource).not.toContain("MockDocument");
    expect(workspaceRouteSource).not.toContain("MockDataBoundary");
  });

  it("does not reference visibility-based workspace access in the real knowledge-base page", () => {
    const workspaceSource = readProjectFile(
      "src/apps/web/src/features/workspace/workspace-mvp-page.tsx",
    );

    expect(workspaceSource).not.toContain("visibility");
    expect(workspaceSource).not.toContain("private/shared");
  });

  it("does not render workspace pagination or recent-update controls", () => {
    const workspaceSource = readProjectFile(
      "src/apps/web/src/features/workspace/workspace-mvp-page.tsx",
    );
    const knowledgeCopySource = readProjectFile("src/apps/web/src/copy/knowledge.ts");

    expect(workspaceSource).not.toContain("AdminPagination");
    expect(workspaceSource).not.toContain("knowledgeCopy.sort");
    expect(workspaceSource).not.toContain("knowledgeCopy.sortLabel");
    expect(workspaceSource).not.toContain("knowledgeCopy.labels.updatedAt");
    expect(knowledgeCopySource).not.toContain("最近更新");
  });

  it("uses sliding infinite-scroll display for the workspace knowledge-base list", () => {
    const workspaceSource = readProjectFile(
      "src/apps/web/src/features/workspace/workspace-mvp-page.tsx",
    );
    const knowledgeHookSource = readProjectFile("src/apps/web/src/features/knowledge/knowledge-hooks.ts");

    expect(workspaceSource).toContain("useInfiniteKnowledgeBases");
    expect(workspaceSource).toContain("fetchNextPage");
    expect(workspaceSource).toContain("onScroll={handleKnowledgeBaseListScroll}");
    expect(knowledgeHookSource).toContain("useInfiniteQuery");
    expect(knowledgeHookSource).toContain("getNextPageParam");
  });

  it("centralizes duplicate, pending, and member-management workspace copy", () => {
    expect(knowledgeCopy.errors.duplicateKnowledgeBase).toBe("当前租户下已存在同名知识库。");
    expect(knowledgeCopy.pending.savingKnowledgeBase).toBe("正在保存知识库。");
    expect(knowledgeCopy.members.searchLabel).toBe("成员");
    expect(knowledgeCopy.members.empty).toBe("未分配成员，默认仅管理员可见。");
  });

  it("connects workspace file upload to the real document upload workflow", () => {
    const workspaceSource = readProjectFile(
      "src/apps/web/src/features/workspace/workspace-mvp-page.tsx",
    );
    const knowledgeHookSource = readProjectFile("src/apps/web/src/features/knowledge/knowledge-hooks.ts");
    const knowledgeCopySource = readProjectFile("src/apps/web/src/copy/knowledge.ts");

    expect(workspaceSource).toContain("UploadDocumentDialog");
    expect(workspaceSource).toContain("mode: \"upload\"");
    expect(workspaceSource).toContain("validateDocumentUploadInput");
    expect(workspaceSource).toContain("formatDocumentUploadSuccessNotice");
    expect(workspaceSource).not.toContain("disabledReason={knowledgeCopy.disabled.uploadPending}");
    expect(knowledgeHookSource).toContain("useUploadDocumentFile");
    expect(knowledgeHookSource).toContain("documentFileUploadResultSchema");
    expect(knowledgeCopySource).toContain("uploadErrors");
    expect(knowledgeCopySource).toContain("uploadSuccess");
  });
});
