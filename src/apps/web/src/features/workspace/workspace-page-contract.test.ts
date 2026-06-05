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

function projectFileExists(relativePath: string): boolean {
  return existsSync(resolve(findRepoRoot(process.cwd()), relativePath));
}

describe("workspace page executable contract", () => {
  it("uses stable workspace page naming without the MVP entrypoint", () => {
    const workspaceRouteSource = readProjectFile("src/apps/web/src/app/workspace/page.tsx");
    const workspaceSource = readProjectFile(
      "src/apps/web/src/features/workspace/workspace-page.tsx",
    );

    expect(
      projectFileExists("src/apps/web/src/features/workspace/workspace-mvp-page.tsx"),
    ).toBe(false);
    expect(workspaceRouteSource).toContain("WorkspacePage");
    expect(workspaceRouteSource).toContain("features/workspace/workspace-page");
    expect(workspaceRouteSource).not.toContain("WorkspaceMvpPage");
    expect(workspaceSource).toContain("export function WorkspacePage");
    expect(workspaceSource.toLowerCase()).not.toContain("mvp");
  });

  it("keeps workspace features split into single-purpose component files", () => {
    const componentExports: Record<string, string> = {
      "src/apps/web/src/features/knowledge/knowledge-base-dialog.tsx":
        "KnowledgeBaseDialog",
      "src/apps/web/src/features/knowledge/knowledge-base-list-item.tsx":
        "KnowledgeBaseListItem",
      "src/apps/web/src/features/knowledge/knowledge-base-list.tsx":
        "KnowledgeBaseList",
      "src/apps/web/src/features/knowledge/document-processing-list.tsx":
        "DocumentProcessingList",
      "src/apps/web/src/features/knowledge/knowledge-base-summary.tsx":
        "KnowledgeBaseSummary",
      "src/apps/web/src/features/knowledge/member-picker.tsx": "MemberPicker",
      "src/apps/web/src/features/workspace/query-error-state.tsx": "QueryErrorState",
      "src/apps/web/src/features/workspace/upload-document-dialog.tsx":
        "UploadDocumentDialog",
      "src/apps/web/src/features/workspace/workspace-metric-tile.tsx":
        "WorkspaceMetricTile",
      "src/apps/web/src/features/workspace/workspace-text-field.tsx":
        "WorkspaceTextField",
      "src/apps/web/src/features/workspace/workspace-textarea-field.tsx":
        "WorkspaceTextareaField",
    };

    for (const [relativePath, componentName] of Object.entries(componentExports)) {
      const source = readProjectFile(relativePath);

      expect(source).toContain(`export function ${componentName}`);
      expect(source).not.toContain("export function WorkspacePage");
    }
  });

  it("removes the workspace page from the frontend mock store", () => {
    const workspaceSource = readProjectFile(
      "src/apps/web/src/features/workspace/workspace-page.tsx",
    );
    const workspaceRouteSource = readProjectFile("src/apps/web/src/app/workspace/page.tsx");

    expect(workspaceSource).not.toContain("features/mock");
    expect(workspaceSource).not.toContain("useMockStore");
    expect(workspaceSource).not.toContain("MockKnowledgeBase");
    expect(workspaceSource).not.toContain("MockDocument");
    expect(workspaceRouteSource).not.toContain("MockDataBoundary");
    expect(workspaceSource).not.toContain("WorkspaceSummaryPanel");
    expect(workspaceSource).not.toContain("documentsPending");
    expect(workspaceSource).not.toContain("tasksPending");
    expect(workspaceSource).not.toContain("logsPending");
  });

  it("does not reference visibility-based workspace access in the real knowledge-base page", () => {
    const workspaceSource = readProjectFile(
      "src/apps/web/src/features/workspace/workspace-page.tsx",
    );

    expect(workspaceSource).not.toContain("visibility");
    expect(workspaceSource).not.toContain("private/shared");
  });

  it("does not render workspace pagination or recent-update controls", () => {
    const workspaceSource = readProjectFile(
      "src/apps/web/src/features/workspace/workspace-page.tsx",
    );
    const knowledgeCopySource = readProjectFile("src/apps/web/src/copy/knowledge.ts");

    expect(workspaceSource).not.toContain("AdminPagination");
    expect(workspaceSource).not.toContain("knowledgeCopy.sort");
    expect(workspaceSource).not.toContain("knowledgeCopy.sortLabel");
    expect(workspaceSource).not.toContain("knowledgeCopy.labels.updatedAt");
    expect(knowledgeCopySource).not.toContain("最近更新");
  });

  it("uses sliding infinite-scroll display for the workspace knowledge-base list", () => {
    const listSource = readProjectFile(
      "src/apps/web/src/features/knowledge/knowledge-base-list.tsx",
    );
    const knowledgeHookSource = readProjectFile(
      "src/apps/web/src/features/hooks/knowledge/knowledge-hooks.ts",
    );

    expect(listSource).toContain("fetchNextPage");
    expect(listSource).toContain("onScroll={handleKnowledgeBaseListScroll}");
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
      "src/apps/web/src/features/workspace/workspace-page.tsx",
    );
    const uploadDialogSource = readProjectFile(
      "src/apps/web/src/features/workspace/upload-document-dialog.tsx",
    );
    const knowledgeHookSource = readProjectFile(
      "src/apps/web/src/features/hooks/knowledge/knowledge-hooks.ts",
    );
    const knowledgeCopySource = readProjectFile("src/apps/web/src/copy/knowledge.ts");

    expect(workspaceSource).toContain("UploadDocumentDialog");
    expect(workspaceSource).toContain("mode: \"upload\"");
    expect(uploadDialogSource).toContain("validateDocumentUploadInput");
    expect(uploadDialogSource).toContain("formatDocumentUploadSuccessNotice");
    expect(workspaceSource).not.toContain("disabledReason={knowledgeCopy.disabled.uploadPending}");
    expect(knowledgeHookSource).toContain("useUploadDocumentFile");
    expect(knowledgeHookSource).toContain("documentFileUploadResultSchema");
    expect(knowledgeCopySource).toContain("uploadErrors");
    expect(knowledgeCopySource).toContain("uploadSuccess");
  });

  it("renders selected knowledge-base document processing progress and retry controls", () => {
    const summarySource = readProjectFile(
      "src/apps/web/src/features/knowledge/knowledge-base-summary.tsx",
    );
    const documentListSource = readProjectFile(
      "src/apps/web/src/features/knowledge/document-processing-list.tsx",
    );
    const knowledgeHookSource = readProjectFile(
      "src/apps/web/src/features/hooks/knowledge/knowledge-hooks.ts",
    );
    const knowledgeCopySource = readProjectFile("src/apps/web/src/copy/knowledge.ts");

    expect(summarySource).toContain("DocumentProcessingList");
    expect(documentListSource).toContain(
      "knowledgeCopy.documentProcessing.progress",
    );
    expect(knowledgeCopySource).toContain("已分段");
    expect(knowledgeCopySource).toContain("已向量化");
    expect(documentListSource).not.toContain("%");
    expect(documentListSource).toContain("useInfiniteDocumentProcessing");
    expect(documentListSource).toContain("useRetryDocumentProcessing");
    expect(documentListSource).toContain("ScrollArea");
    expect(summarySource).not.toContain("knowledgeBase.documents");
    expect(knowledgeHookSource).toContain("documents.processing.$get");
    expect(knowledgeHookSource).toContain("useRetryDocumentProcessing");
    expect(knowledgeCopySource).toContain("documentProcessing");
    expect(knowledgeCopySource).toContain("重试次数已用尽");
  });
});
