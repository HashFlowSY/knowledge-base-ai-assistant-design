import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createSeedMockState, mockStoreReducer } from "../mock/store";
import {
  canRetryIngestionJob,
  detailForRow,
  parsePositiveInt,
  providerSlotsForState,
  rowSelectionFromId,
  rowsForKind,
  shouldShowDetailCopyButton,
  targetHrefForAuditEvent,
} from "./admin-list-helpers";
import {
  canRemoveUserAccessFromUi,
  roleOptionsForUser,
  shouldLogoutAfterUserUpdate,
} from "./user-ui-helpers";

describe("admin list page helpers", () => {
  it("keeps the route-level admin page module small after component extraction", () => {
    const source = readFileSync(
      new URL("./admin-list-page.tsx", import.meta.url),
      "utf8",
    );

    expect(source.trimEnd().split("\n").length).toBeLessThan(150);
  });

  it("parses positive pagination integers with a fallback", () => {
    expect(parsePositiveInt("3", 1)).toBe(3);
    expect(parsePositiveInt("0", 1)).toBe(1);
    expect(parsePositiveInt("-2", 1)).toBe(1);
    expect(parsePositiveInt("abc", 8)).toBe(8);
    expect(parsePositiveInt(null, 8)).toBe(8);
  });

  it("allows failed and cancelled task rows to expose retry while respecting max attempts", () => {
    const state = mockStoreReducer(createSeedMockState(), {
      fileName: "待处理文档.pdf",
      knowledgeBaseId: "kb-finance",
      type: "uploadFile",
    });
    const job = state.jobs[0];

    expect(job).toBeDefined();
    if (job === undefined) {
      return;
    }

    expect(canRetryIngestionJob({ ...job, attempts: 0, status: "failed" })).toBe(true);
    expect(canRetryIngestionJob({ ...job, attempts: 0, status: "cancelled" })).toBe(true);
    expect(canRetryIngestionJob({ ...job, attempts: 0, status: "queued" })).toBe(false);
    expect(canRetryIngestionJob({ ...job, attempts: job.maxAttempts, status: "cancelled" })).toBe(false);
  });

  it("routes each admin page kind to filtered and sorted mock rows", () => {
    const state = mockStoreReducer(createSeedMockState(), {
      fileName: "供应商准入规范.pdf",
      knowledgeBaseId: "kb-finance",
      type: "uploadFile",
    });
    const jobId = state.jobs[0]?.id;
    const logId = state.logs[0]?.id;

    expect(rowsForKind(state, "tasks", "供应商", "all", "name").map((row) => row.id)).toEqual([jobId]);
    expect(rowsForKind(state, "logs", "已创建", "info", "updated").map((row) => row.id)).toEqual([logId]);
    expect(rowsForKind(state, "providers", "gpt-4.1", "enabled", "name").map((row) => row.id)).toEqual([
      "provider-openai-main",
    ]);
    expect(rowsForKind(state, "users", "admin", "admin", "name").map((row) => row.id)).toEqual([
      "user-admin-001",
    ]);
    expect(rowsForKind(state, "audit", "provider", "provider.update", "updated").map((row) => row.id)).toEqual([
      "audit-provider-001",
    ]);
  });

  it("exposes fixed provider kind slots even when a model config is missing", () => {
    const state = {
      ...createSeedMockState(),
      providerConfigs: createSeedMockState().providerConfigs.filter((provider) => provider.kind !== "rerank"),
    };

    expect(providerSlotsForState(state, "", "all").map((slot) => slot.kind)).toEqual([
      "chat",
      "embedding",
      "rerank",
    ]);
    expect(providerSlotsForState(state, "", "missing").map((slot) => slot.kind)).toEqual(["rerank"]);
    expect(providerSlotsForState(state, "问答", "all").map((slot) => slot.kind)).toEqual(["chat"]);
  });

  it("formats drawer details for selected admin rows", () => {
    const state = mockStoreReducer(createSeedMockState(), {
      fileName: "供应商准入规范.pdf",
      knowledgeBaseId: "kb-finance",
      type: "uploadFile",
    });
    const jobId = state.jobs[0]?.id ?? "";
    const logId = state.logs[0]?.id ?? "";

    expect(detailForRow({ id: jobId, kind: "tasks" }, state)).toContainEqual([
      "文档",
      "供应商准入规范.pdf",
    ]);
    expect(detailForRow({ id: logId, kind: "logs" }, state)).toContainEqual([
      "消息",
      "已创建文件上传任务。",
    ]);
    expect(detailForRow({ id: "provider-openai-main", kind: "providers" }, state)).toContainEqual([
      "密钥",
      "•••• 4F2A",
    ]);
    expect(detailForRow({ id: "user-admin-001", kind: "users" }, state)).toContainEqual([
      "邮箱",
      "admin@example.com",
    ]);
    expect(detailForRow({ id: "audit-provider-001", kind: "audit" }, state)).toContainEqual(["动作", "编辑模型服务"]);
  });

  it("does not expose copy controls inside the detail page", () => {
    expect(shouldShowDetailCopyButton()).toBe(false);
  });

  it("protects the current admin from self access removal and self demotion in the UI", () => {
    expect(canRemoveUserAccessFromUi({ currentUserId: "admin_1", targetUserId: "user_2" })).toBe(true);
    expect(canRemoveUserAccessFromUi({ currentUserId: "admin_1", targetUserId: "admin_1" })).toBe(false);

    expect(roleOptionsForUser({ currentUserId: "admin_1", targetUserId: "user_2" }).map((option) => option.value)).toEqual([
      "member",
      "admin",
    ]);
    expect(roleOptionsForUser({ currentUserId: "admin_1", targetUserId: "admin_1" }).map((option) => option.value)).toEqual([
      "admin",
    ]);
  });

  it("logs out the current admin only after a self password reset", () => {
    expect(
      shouldLogoutAfterUserUpdate({
        currentUserId: "admin_1",
        password: "new-password",
        targetUserId: "admin_1",
      }),
    ).toBe(true);
    expect(
      shouldLogoutAfterUserUpdate({
        currentUserId: "admin_1",
        password: "",
        targetUserId: "admin_1",
      }),
    ).toBe(false);
    expect(
      shouldLogoutAfterUserUpdate({
        currentUserId: "admin_1",
        password: "new-password",
        targetUserId: "user_2",
      }),
    ).toBe(false);
  });

  it("restores admin row detail selections from URL selectedId values", () => {
    const state = mockStoreReducer(createSeedMockState(), {
      fileName: "供应商准入规范.pdf",
      knowledgeBaseId: "kb-finance",
      type: "uploadFile",
    });
    const jobId = state.jobs[0]?.id ?? "";
    const logId = state.logs[0]?.id ?? "";

    expect(rowSelectionFromId("tasks", jobId, state)).toEqual({
      id: jobId,
      kind: "tasks",
    });
    expect(rowSelectionFromId("logs", logId, state)).toEqual({
      id: logId,
      kind: "logs",
    });
    expect(rowSelectionFromId("providers", "provider-openai-main", state)).toEqual({
      id: "provider-openai-main",
      kind: "providers",
    });
    expect(rowSelectionFromId("users", "user-admin-001", state)).toEqual({
      id: "user-admin-001",
      kind: "users",
    });
    expect(rowSelectionFromId("audit", "audit-provider-001", state)).toEqual({
      id: "audit-provider-001",
      kind: "audit",
    });
    expect(rowSelectionFromId("tasks", "missing-job", state)).toBeNull();
  });

  it("maps audit targets to navigable destinations only when a page exists", () => {
    const state = createSeedMockState();
    const providerEvent = state.auditEvents.find((item) => item.targetType === "provider");
    expect(providerEvent).toBeDefined();

    if (providerEvent !== undefined) {
      expect(targetHrefForAuditEvent(providerEvent)).toBe("/providers");
    }

    expect(
      targetHrefForAuditEvent({
        actorId: "user-admin-001",
        actorType: "user",
        action: "document.import",
        createdAt: "2026-05-15T10:00:00.000Z",
        id: "audit-document",
        ipSummary: "10.0.0.12/24",
        requestId: "req-document",
        sanitizedMetadata: "target=doc-uploaded",
        targetId: "doc-uploaded",
        targetType: "document",
        userAgentSummary: "Chrome Desktop",
      }),
    ).toBeNull();

    expect(
      targetHrefForAuditEvent({
        actorId: "user-admin-001",
        actorType: "user",
        action: "job.cancel",
        createdAt: "2026-05-15T10:00:00.000Z",
        id: "audit-job-cancel",
        ipSummary: "10.0.0.12/24",
        requestId: "req-job-cancel",
        sanitizedMetadata: "target=job-invoice-001",
        targetId: "job-invoice-001",
        targetType: "ingestion_job",
        userAgentSummary: "Chrome Desktop",
      }),
    ).toBe("/tasks?selectedId=job-invoice-001");

    expect(
      targetHrefForAuditEvent({
        actorId: "user-admin-001",
        actorType: "user",
        action: "session.expire",
        createdAt: "2026-05-15T10:00:00.000Z",
        id: "audit-session",
        ipSummary: "10.0.0.12/24",
        requestId: "req-session",
        sanitizedMetadata: "redirectTo=/chat",
        targetId: "/chat",
        targetType: "session",
        userAgentSummary: "Chrome Desktop",
      }),
    ).toBeNull();
  });
});
