import { describe, expect, it } from "vitest";

import { createSeedMockState } from "../mock/store";
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

describe("admin list page helpers", () => {
  it("parses positive pagination integers with a fallback", () => {
    expect(parsePositiveInt("3", 1)).toBe(3);
    expect(parsePositiveInt("0", 1)).toBe(1);
    expect(parsePositiveInt("-2", 1)).toBe(1);
    expect(parsePositiveInt("abc", 8)).toBe(8);
    expect(parsePositiveInt(null, 8)).toBe(8);
  });

  it("allows failed and cancelled task rows to expose retry while respecting max attempts", () => {
    const job = createSeedMockState().jobs.find((item) => item.id === "job-support-001");

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
    const state = createSeedMockState();

    expect(rowsForKind(state, "tasks", "travel", "all", "name").map((row) => row.id)).toEqual([
      "job-import-001",
    ]);
    expect(rowsForKind(state, "logs", "解析", "info", "updated").map((row) => row.id)).toEqual([
      "log-import-001",
    ]);
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
    const state = createSeedMockState();

    expect(detailForRow({ id: "job-import-001", kind: "tasks" }, state)).toContainEqual([
      "文档",
      "差旅报销管理办法 2026",
    ]);
    expect(detailForRow({ id: "log-import-001", kind: "logs" }, state)).toContainEqual([
      "requestId",
      "req-import-001",
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

  it("restores admin row detail selections from URL selectedId values", () => {
    const state = createSeedMockState();

    expect(rowSelectionFromId("tasks", "job-import-001", state)).toEqual({
      id: "job-import-001",
      kind: "tasks",
    });
    expect(rowSelectionFromId("logs", "log-import-001", state)).toEqual({
      id: "log-import-001",
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
