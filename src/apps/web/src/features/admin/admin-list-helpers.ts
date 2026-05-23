import {
  auditActionLabel,
  documentTitle,
  knowledgeBaseName,
  statusLabel,
} from "../mock/selectors";
import type {
  MockAuditEvent,
  MockIngestionJob,
  MockProcessingLog,
  MockProviderConfig,
  MockProviderKind,
  MockState,
  MockUser,
} from "../mock/types";

export type AdminPageKind = "tasks" | "logs" | "providers" | "users" | "audit";
export type AdminRow =
  | MockAuditEvent
  | MockIngestionJob
  | MockProcessingLog
  | MockProviderConfig
  | MockUser;
export type SelectedAdminRow =
  | { kind: "tasks"; id: string }
  | { kind: "logs"; id: string }
  | { kind: "providers"; id: string }
  | { kind: "users"; id: string }
  | { kind: "audit"; id: string };

export interface ProviderSlot {
  kind: MockProviderKind;
  label: string;
  provider: MockProviderConfig | null;
}

export const providerKindOrder: MockProviderKind[] = ["chat", "embedding", "rerank"];

export const providerKindLabels: Record<MockProviderKind, string> = {
  chat: "问答模型",
  embedding: "向量模型",
  rerank: "重排模型",
};

export function rowsForKind(
  state: MockState,
  kind: AdminPageKind,
  search: string,
  filter: string,
  sort: string,
): AdminRow[] {
  if (kind === "tasks") {
    return filterAndSortJobs(state, search, filter, sort);
  }
  if (kind === "logs") {
    return filterAndSortLogs(state, search, filter, sort);
  }
  if (kind === "providers") {
    return filterAndSortProviders(state, search, filter, sort);
  }
  if (kind === "users") {
    return filterAndSortUsers(state, search, filter, sort);
  }

  return filterAndSortAudit(state, search, filter, sort);
}

export function parsePositiveInt(value: string | null, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function providerSlotsForState(state: MockState, search: string, filter: string): ProviderSlot[] {
  const normalizedSearch = search.trim().toLowerCase();

  return providerKindOrder
    .map((kind) => ({
      kind,
      label: providerKindLabels[kind],
      provider: state.providerConfigs.find((item) => item.kind === kind) ?? null,
    }))
    .filter((slot) => {
      const status = slot.provider?.status ?? "missing";
      const haystack = [
        slot.label,
        slot.kind,
        slot.provider?.displayName ?? "未配置",
        slot.provider?.provider ?? "",
        slot.provider?.modelId ?? "",
        slot.provider?.baseUrl ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch) && (filter === "all" || status === filter);
    });
}

export function canRetryIngestionJob(job: MockIngestionJob): boolean {
  return (job.status === "failed" || job.status === "cancelled") && job.attempts < job.maxAttempts;
}

export function shouldShowDetailCopyButton(): boolean {
  return false;
}

function filterAndSortJobs(
  state: MockState,
  search: string,
  filter: string,
  sort: string,
): MockIngestionJob[] {
  return sortRows(
    state.jobs.filter((job) => {
      const haystack =
        `${job.id} ${job.documentId} ${documentTitle(state, job.documentId)} ${knowledgeBaseName(state, job.knowledgeBaseId)}`.toLowerCase();
      return haystack.includes(search.toLowerCase()) && (filter === "all" || job.status === filter);
    }),
    sort,
    (job) => documentTitle(state, job.documentId),
    (job) => job.status,
    (job) => job.queuedAt,
  );
}

export function detailForRow(selected: SelectedAdminRow, state: MockState): [string, string][] {
  if (selected.kind === "tasks") {
    const job = state.jobs.find((item) => item.id === selected.id);
    return job === undefined
      ? [["状态", "未找到"]]
      : [
          ["任务", job.id],
          ["文档", documentTitle(state, job.documentId)],
          ["知识库", knowledgeBaseName(state, job.knowledgeBaseId)],
          ["状态", statusLabel(job.status)],
          ["步骤", job.currentStep],
          ["错误", job.lastError ?? "无"],
        ];
  }
  if (selected.kind === "logs") {
    const log = state.logs.find((item) => item.id === selected.id);
    return log === undefined
      ? [["状态", "未找到"]]
      : [
          ["日志", log.id],
          ["requestId", log.requestId],
          ["消息", log.message],
          ["metadata", log.metadataSummary],
          ["错误码", log.errorCode ?? "无"],
        ];
  }
  if (selected.kind === "providers") {
    const provider = state.providerConfigs.find((item) => item.id === selected.id);
    return provider === undefined
      ? [["状态", "未找到"]]
      : [
          ["模型服务", provider.displayName],
          ["Provider", provider.provider],
          ["模型", provider.modelId],
          ["Base URL", provider.baseUrl],
          ["状态", statusLabel(provider.status)],
          ["密钥", provider.maskedKeySuffix],
          ["版本", provider.keyVersion.toString()],
        ];
  }
  if (selected.kind === "users") {
    const user = state.users.find((item) => item.id === selected.id);
    return user === undefined
      ? [["状态", "未找到"]]
      : [
          ["用户", user.name],
          ["邮箱", user.email],
          ["角色", user.role],
          ["状态", statusLabel(user.status)],
          ["邮箱验证", user.emailVerified ? "已验证" : "未验证"],
        ];
  }

  const event = state.auditEvents.find((item) => item.id === selected.id);
  return event === undefined
    ? [["状态", "未找到"]]
    : [
        ["审计事件", event.id],
        ["动作", auditActionLabel(event.action)],
        ["requestId", event.requestId],
        ["目标", `${event.targetType}:${event.targetId}`],
        ["metadata", event.sanitizedMetadata],
      ];
}

export function rowSelectionFromId(
  kind: AdminPageKind,
  selectedId: string | null,
  state: MockState,
): SelectedAdminRow | null {
  if (selectedId === null) {
    return null;
  }

  if (kind === "tasks" && state.jobs.some((item) => item.id === selectedId)) {
    return { id: selectedId, kind };
  }

  if (kind === "logs" && state.logs.some((item) => item.id === selectedId)) {
    return { id: selectedId, kind };
  }

  if (kind === "providers" && state.providerConfigs.some((item) => item.id === selectedId)) {
    return { id: selectedId, kind };
  }

  if (kind === "users" && state.users.some((item) => item.id === selectedId)) {
    return { id: selectedId, kind };
  }

  if (kind === "audit" && state.auditEvents.some((item) => item.id === selectedId)) {
    return { id: selectedId, kind };
  }

  return null;
}

export function targetHrefForAuditEvent(event: MockAuditEvent): string | null {
  if (event.targetType === "document") {
    return null;
  }
  if (event.targetType === "provider") {
    return "/providers";
  }
  if (event.targetType === "user") {
    return "/users";
  }
  if (event.targetType === "ingestion_job") {
    return `/tasks?selectedId=${encodeURIComponent(event.targetId)}`;
  }

  return null;
}

function filterAndSortLogs(
  state: MockState,
  search: string,
  filter: string,
  sort: string,
): MockProcessingLog[] {
  return sortRows(
    state.logs.filter((log) => {
      const haystack =
        `${log.id} ${log.message} ${log.errorCode ?? ""} ${documentTitle(state, log.documentId)}`.toLowerCase();
      return haystack.includes(search.toLowerCase()) && (filter === "all" || log.level === filter);
    }),
    sort,
    (log) => log.message,
    (log) => log.level,
    (log) => log.createdAt,
  );
}

function filterAndSortProviders(
  state: MockState,
  search: string,
  filter: string,
  sort: string,
): MockProviderConfig[] {
  return sortRows(
    state.providerConfigs.filter((provider) => {
      const haystack =
        `${provider.displayName} ${provider.provider} ${provider.modelId} ${provider.kind}`.toLowerCase();
      return haystack.includes(search.toLowerCase()) && (filter === "all" || provider.status === filter);
    }),
    sort,
    (provider) => provider.displayName,
    (provider) => provider.status,
    (provider) => provider.updatedAt,
  );
}

function filterAndSortUsers(
  state: MockState,
  search: string,
  filter: string,
  sort: string,
): MockUser[] {
  return sortRows(
    state.users.filter((user) => {
      const haystack = `${user.name} ${user.email} ${user.role}`.toLowerCase();
      return haystack.includes(search.toLowerCase()) && (filter === "all" || user.role === filter);
    }),
    sort,
    (user) => user.name,
    (user) => user.status,
    (user) => user.updatedAt,
  );
}

function filterAndSortAudit(
  state: MockState,
  search: string,
  filter: string,
  sort: string,
): MockAuditEvent[] {
  return sortRows(
    state.auditEvents.filter((event) => {
      const haystack =
        `${event.id} ${event.action} ${event.targetId} ${event.requestId} ${event.sanitizedMetadata}`.toLowerCase();
      return haystack.includes(search.toLowerCase()) && (filter === "all" || event.action === filter);
    }),
    sort,
    (event) => event.action,
    (event) => event.targetType,
    (event) => event.createdAt,
  );
}

function sortRows<T>(
  rows: T[],
  sort: string,
  nameValue: (row: T) => string,
  statusValue: (row: T) => string,
  updatedValue: (row: T) => string,
): T[] {
  return [...rows].sort((left, right) => {
    if (sort === "name") {
      return nameValue(left).localeCompare(nameValue(right), "zh-CN");
    }
    if (sort === "status") {
      return statusValue(left).localeCompare(statusValue(right), "zh-CN");
    }

    return updatedValue(right).localeCompare(updatedValue(left));
  });
}
