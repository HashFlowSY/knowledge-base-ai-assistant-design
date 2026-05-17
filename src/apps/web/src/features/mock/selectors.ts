import type {
  MockAuditAction,
  MockDocumentStatus,
  MockIngestionStatus,
  MockKnowledgeBaseStatus,
  MockLogLevel,
  MockProviderStatus,
  MockSourceType,
  MockState,
  MockUserStatus,
} from "./types";

export function knowledgeBaseName(state: MockState, knowledgeBaseId: string): string {
  return state.knowledgeBases.find((item) => item.id === knowledgeBaseId)?.name ?? "未知知识库";
}

export function documentTitle(state: MockState, documentId: string): string {
  return state.documents.find((item) => item.id === documentId)?.title ?? "未知文档";
}

export function userName(state: MockState, userId: string): string {
  return state.users.find((item) => item.id === userId)?.name ?? "系统";
}

export function statusLabel(
  status:
    | MockKnowledgeBaseStatus
    | MockDocumentStatus
    | MockIngestionStatus
    | MockProviderStatus
    | MockUserStatus
    | MockLogLevel,
): string {
  const labels: Record<
    | MockKnowledgeBaseStatus
    | MockDocumentStatus
    | MockIngestionStatus
    | MockProviderStatus
    | MockUserStatus
    | MockLogLevel,
    string
  > = {
    active: "启用",
    cancelled: "已取消",
    disabled: "停用",
    empty: "空",
    enabled: "启用",
    error: "错误",
    failed: "失败",
    info: "信息",
    pending: "待确认",
    processing: "处理中",
    queued: "排队中",
    ready: "可用",
    running: "运行中",
    succeeded: "成功",
    testing: "测试中",
    warning: "警告",
  };

  return labels[status];
}

export function sourceTypeLabel(type: MockSourceType): string {
  return type === "file" ? "文件" : "网页";
}

export function auditActionLabel(action: MockAuditAction): string {
  const labels: Record<MockAuditAction, string> = {
    "chat.feedback.submit": "提交问答反馈",
    "document.import": "导入文档",
    "job.cancel": "取消任务",
    "job.retry": "重试任务",
    "knowledge_base.create": "新建知识库",
    "provider.create": "新增模型服务",
    "provider.delete": "删除模型服务",
    "provider.test_connection": "测试模型服务连接",
    "provider.update": "编辑模型服务",
    "session.expire": "会话过期",
    "user.create": "新增用户",
    "user.delete": "删除用户",
    "user.disable": "停用用户",
    "user.enable": "启用用户",
    "user.role_change": "修改用户角色",
    "user.update": "编辑用户",
  };

  return labels[action];
}
