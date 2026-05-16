import { describe, expect, it } from "vitest";

import {
  createSeedMockState,
  getRouteAccess,
  hydrateMockState,
  isInternalRedirect,
  mockStoreReducer,
  sanitizeRedirectTo,
} from "./store";
import { MOCK_STORAGE_KEY } from "./types";

describe("frontend mock store contract", () => {
  it("uses the PRD storage key and deterministic seed ids", () => {
    const state = createSeedMockState();

    expect(MOCK_STORAGE_KEY).toBe("kbai.frontendMock.v1");
    expect(state.schemaVersion).toBe(1);
    expect(state.knowledgeBases.map((item) => item.id)).toContain("kb-finance");
    expect(state.documents.map((item) => item.id)).toContain("doc-travel-policy");
    expect(state.chunks.map((item) => item.id)).toContain("chunk-travel-001");
    expect(state.jobs.map((item) => item.id)).toContain("job-import-001");
    expect(state.logs.map((item) => item.id)).toContain("log-import-001");
    expect(state.chatSessions.map((item) => item.id)).toContain("session-finance-001");
    expect(state.citations.map((item) => item.id)).toContain("citation-travel-001");
    expect(state.providerConfigs.map((item) => item.id)).toContain("provider-openai-main");
    expect(state.providerConfigs.map((item) => item.kind)).toEqual(["chat", "embedding", "rerank"]);
    expect(state.providerConfigs.some((item) => item.displayName.includes("备用"))).toBe(false);
    expect(state.auditEvents.map((item) => item.id)).toContain("audit-provider-001");
    expect(state.users.map((item) => item.id)).toContain("user-admin-001");
  });

  it("recovers corrupted or unsupported persisted state to seed data with a user notice", () => {
    const parsedFromBadJson = hydrateMockState("{");
    const parsedFromUnsupportedVersion = hydrateMockState(
      JSON.stringify({ ...createSeedMockState(), schemaVersion: 999 }),
    );
    const parsedFromMissingCollections = hydrateMockState(
      JSON.stringify({ schemaVersion: 1, users: [] }),
    );
    const seed = createSeedMockState();
    const parsedFromValidState = hydrateMockState(
      JSON.stringify({
        ...seed,
        selectedKnowledgeBaseId: "kb-support",
      }),
    );

    expect(parsedFromBadJson.state.knowledgeBases[0]?.id).toBe("kb-finance");
    expect(parsedFromBadJson.notice).toBe("演示数据已恢复为初始状态。");
    expect(parsedFromUnsupportedVersion.state.schemaVersion).toBe(1);
    expect(parsedFromUnsupportedVersion.notice).toBe("演示数据已恢复为初始状态。");
    expect(parsedFromMissingCollections.state.documents[0]?.id).toBe("doc-travel-policy");
    expect(parsedFromMissingCollections.notice).toBe("演示数据已恢复为初始状态。");
    expect(parsedFromValidState.state.selectedKnowledgeBaseId).toBe("kb-support");
    expect(parsedFromValidState.notice).toBeNull();
  });

  it("allows only internal redirectTo targets", () => {
    expect(isInternalRedirect("/workspace")).toBe(true);
    expect(isInternalRedirect("/documents/doc-travel-policy?chunkId=chunk-travel-001")).toBe(true);
    expect(isInternalRedirect("https://evil.example/workspace")).toBe(false);
    expect(isInternalRedirect("//evil.example/workspace")).toBe(false);
    expect(isInternalRedirect("workspace")).toBe(false);
    expect(sanitizeRedirectTo("https://evil.example/workspace")).toBe("/workspace");
  });

  it("implements the route access matrix for guest, admin, and member sessions", () => {
    const seed = createSeedMockState();

    expect(getRouteAccess(seed.session, "/workspace")).toEqual({
      allowed: false,
      redirectTo: "/login?redirectTo=%2Fworkspace",
      reason: "login_required",
    });

    const adminState = mockStoreReducer(seed, {
      email: "admin@example.com",
      password: "password123",
      redirectTo: "/providers",
      type: "login",
    });
    expect(getRouteAccess(adminState.session, "/providers")).toEqual({ allowed: true });
    expect(getRouteAccess(adminState.session, "/login")).toEqual({
      allowed: false,
      redirectTo: "/providers",
      reason: "already_authenticated",
    });

    const memberState = mockStoreReducer(seed, {
      email: "member@example.com",
      password: "password123",
      redirectTo: "/providers",
      type: "login",
    });
    expect(getRouteAccess(memberState.session, "/tasks")).toEqual({ allowed: true });
    expect(getRouteAccess(memberState.session, "/providers")).toEqual({
      allowed: false,
      redirectTo: "/unauthorized",
      reason: "forbidden",
    });
    expect(getRouteAccess(memberState.session, "/providers/provider-openai-main")).toEqual({
      allowed: false,
      redirectTo: "/unauthorized",
      reason: "forbidden",
    });
    expect(getRouteAccess(memberState.session, "/chat")).toEqual({ allowed: true });

    const expiredState = mockStoreReducer(adminState, {
      intendedRedirectTo: "/chat",
      type: "expireSession",
    });
    expect(getRouteAccess(expiredState.session, "/chat")).toEqual({
      allowed: false,
      redirectTo: "/login?redirectTo=%2Fchat&sessionExpired=1",
      reason: "login_required",
    });
    expect(expiredState.auditEvents[0]?.action).toBe("session.expire");
  });

  it("hydrates valid persisted state through the reducer without changing the schema contract", () => {
    const seed = createSeedMockState();
    const hydrated = mockStoreReducer(seed, {
      state: {
        ...seed,
        selectedKnowledgeBaseId: "kb-support",
      },
      type: "hydrateState",
    });

    expect(hydrated.schemaVersion).toBe(1);
    expect(hydrated.selectedKnowledgeBaseId).toBe("kb-support");
  });

  it("creates visible knowledge, document, task, log, and audit state through local mutations", () => {
    const seed = mockStoreReducer(createSeedMockState(), {
      email: "admin@example.com",
      password: "password123",
      redirectTo: "/workspace",
      type: "login",
    });
    const withKnowledgeBase = mockStoreReducer(seed, {
      description: "供应商合同与采购条款",
      name: "采购合同知识库",
      type: "createKnowledgeBase",
    });
    const createdKnowledgeBase = withKnowledgeBase.knowledgeBases.find(
      (item) => item.name === "采购合同知识库",
    );

    expect(createdKnowledgeBase?.status).toBe("empty");
    expect(withKnowledgeBase.selectedKnowledgeBaseId).toBe(createdKnowledgeBase?.id);

    const knowledgeBaseId = createdKnowledgeBase?.id ?? "";
    const withUpload = mockStoreReducer(withKnowledgeBase, {
      fileName: "供应商准入规范.pdf",
      knowledgeBaseId,
      type: "uploadFile",
    });
    const createdDocument = withUpload.documents.find((item) => item.title === "供应商准入规范.pdf");
    const createdJob = withUpload.jobs.find((item) => item.documentId === createdDocument?.id);
    const createdLog = withUpload.logs.find((item) => item.jobId === createdJob?.id);

    expect(createdDocument?.knowledgeBaseId).toBe(knowledgeBaseId);
    expect(createdJob?.status).toBe("queued");
    expect(createdLog?.message).toContain("已创建");
    expect(withUpload.auditEvents.some((item) => item.action === "document.import")).toBe(true);
  });

  it("keeps processing log ids unique across repeated mutations at the fixed mock timestamp", () => {
    const seed = createSeedMockState();
    const withFirstRetry = mockStoreReducer(seed, {
      jobId: "job-invoice-001",
      type: "retryJob",
    });
    const withSecondRetry = mockStoreReducer(
      {
        ...withFirstRetry,
        jobs: withFirstRetry.jobs.map((job) =>
          job.id === "job-invoice-001"
            ? {
                ...job,
                attempts: 2,
                status: "failed",
              }
            : job,
        ),
      },
      {
        jobId: "job-invoice-001",
        type: "retryJob",
      },
    );
    const logIds = withSecondRetry.logs.map((log) => log.id);

    expect(new Set(logIds).size).toBe(logIds.length);
    expect(logIds.filter((id) => id.startsWith("log-job-invoice-001-queued-"))).toHaveLength(2);
  });

  it("allows cancelled ingestion jobs to be retried", () => {
    const seed = createSeedMockState();
    const cancelled = mockStoreReducer(seed, {
      jobId: "job-support-001",
      type: "cancelJob",
    });
    const retried = mockStoreReducer(cancelled, {
      jobId: "job-support-001",
      type: "retryJob",
    });
    const job = retried.jobs.find((item) => item.id === "job-support-001");

    expect(cancelled.jobs.find((item) => item.id === "job-support-001")?.status).toBe("cancelled");
    expect(job).toMatchObject({
      attempts: 1,
      currentStep: "queued",
      finishedAt: null,
      lastError: null,
      status: "queued",
    });
    expect(retried.auditEvents[0]).toMatchObject({
      action: "job.retry",
      targetId: "job-support-001",
      targetType: "ingestion_job",
    });
  });

  it("prevents member users from creating duplicate knowledge bases", () => {
    const memberState = mockStoreReducer(createSeedMockState(), {
      email: "member@example.com",
      password: "password123",
      redirectTo: "/workspace",
      type: "login",
    });
    const attempted = mockStoreReducer(memberState, {
      description: "重复知识库",
      name: "成员创建的知识库",
      type: "createKnowledgeBase",
    });

    expect(attempted.knowledgeBases).toHaveLength(memberState.knowledgeBases.length);
    expect(attempted.selectedKnowledgeBaseId).toBe(memberState.selectedKnowledgeBaseId);
    expect(attempted.auditEvents).toHaveLength(memberState.auditEvents.length);
  });

  it("allows disabled users to be enabled again with an audit event", () => {
    const disabled = mockStoreReducer(createSeedMockState(), {
      type: "setUserStatus",
      userId: "user-member-001",
      status: "disabled",
    });
    const enabled = mockStoreReducer(disabled, {
      type: "setUserStatus",
      userId: "user-member-001",
      status: "active",
    });

    expect(enabled.users.find((item) => item.id === "user-member-001")?.status).toBe("active");
    expect(enabled.auditEvents[0]).toMatchObject({
      action: "user.enable",
      targetId: "user-member-001",
      targetType: "user",
    });
  });

  it("creates, updates, and deletes users through CRUD mutations", () => {
    const created = mockStoreReducer(createSeedMockState(), {
      email: "operator@example.com",
      name: "运营管理员",
      role: "member",
      status: "active",
      type: "createUser",
    });
    const createdUser = created.users.find((item) => item.email === "operator@example.com");

    expect(createdUser).toMatchObject({
      email: "operator@example.com",
      emailVerified: true,
      name: "运营管理员",
      role: "member",
      status: "active",
    });
    expect(created.auditEvents[0]).toMatchObject({
      action: "user.create",
      targetId: createdUser?.id,
      targetType: "user",
    });

    const updated = mockStoreReducer(created, {
      email: "ops-admin@example.com",
      name: "运营负责人",
      role: "admin",
      status: "pending",
      type: "updateUser",
      userId: createdUser?.id ?? "",
    });

    expect(updated.users.find((item) => item.id === createdUser?.id)).toMatchObject({
      email: "ops-admin@example.com",
      name: "运营负责人",
      role: "admin",
      status: "pending",
    });
    expect(updated.auditEvents[0]).toMatchObject({
      action: "user.update",
      targetId: createdUser?.id,
      targetType: "user",
    });

    const deleted = mockStoreReducer(updated, {
      type: "deleteUser",
      userId: createdUser?.id ?? "",
    });

    expect(deleted.users.some((item) => item.id === createdUser?.id)).toBe(false);
    expect(deleted.auditEvents[0]).toMatchObject({
      action: "user.delete",
      targetId: createdUser?.id,
      targetType: "user",
    });
  });

  it("submits chat questions, citations, retry states, and answer feedback", () => {
    const seed = createSeedMockState();
    const withQuestion = mockStoreReducer(seed, {
      knowledgeBaseId: "kb-finance",
      mode: "with_citation",
      question: "差旅住宿标准是多少？",
      sessionId: "session-finance-001",
      type: "submitChatQuestion",
    });
    const answer = withQuestion.chatSessions
      .find((item) => item.id === "session-finance-001")
      ?.messages.find((message) => message.role === "assistant" && message.content.includes("差旅"));

    expect(answer?.lifecycle).toBe("completed");
    expect(answer?.citationIds.length).toBeGreaterThan(0);

    const answerId = answer?.id ?? "";
    const withFeedback = mockStoreReducer(withQuestion, {
      answerMessageId: answerId,
      rating: "useful",
      reason: "引用准确",
      type: "submitChatFeedback",
    });
    const updatedAnswer = withFeedback.chatSessions
      .find((item) => item.id === "session-finance-001")
      ?.messages.find((message) => message.id === answerId);

    expect(updatedAnswer?.feedback).toEqual({
      rating: "useful",
      reason: "引用准确",
      submittedAt: "2026-05-15T10:00:00.000Z",
    });
    expect(withFeedback.auditEvents.some((item) => item.action === "chat.feedback.submit")).toBe(
      true,
    );

    const failed = mockStoreReducer(seed, {
      knowledgeBaseId: "kb-finance",
      mode: "failed",
      question: "触发失败",
      sessionId: "session-finance-001",
      type: "submitChatQuestion",
    });
    const failedAnswer = failed.chatSessions
      .find((item) => item.id === "session-finance-001")
      ?.messages.find((message) => message.role === "assistant" && message.lifecycle === "failed");

    expect(failedAnswer?.content).toContain("生成失败");

    const retrieving = mockStoreReducer(seed, {
      knowledgeBaseId: "kb-finance",
      mode: "retrieving",
      question: "触发检索中",
      sessionId: "session-finance-001",
      type: "submitChatQuestion",
    });
    const retrievingAnswer = retrieving.chatSessions
      .find((item) => item.id === "session-finance-001")
      ?.messages.find((message) => message.role === "assistant" && message.lifecycle === "retrieving");

    expect(retrievingAnswer?.content).toContain("正在检索");
  });

  it("creates, updates, and deletes fixed provider kind configs with automatic connection-test audit events", () => {
    const seed = createSeedMockState();
    const withoutRerank = mockStoreReducer(seed, {
      providerId: "provider-rerank-main",
      type: "deleteProviderConfig",
    });

    expect(withoutRerank.providerConfigs.some((provider) => provider.kind === "rerank")).toBe(false);
    expect(withoutRerank.auditEvents[0]).toMatchObject({
      action: "provider.delete",
      targetId: "provider-rerank-main",
      targetType: "provider",
    });

    const created = mockStoreReducer(withoutRerank, {
      provider: {
        apiKey: "sk-rerank-3456",
        baseUrl: "https://models.example.com/v1",
        displayName: "重排模型服务",
        kind: "rerank",
        modelId: "rerank-v2",
        provider: "Cohere Compatible",
        status: "enabled",
      },
      type: "saveProviderConfig",
    });
    const createdProvider = created.providerConfigs.find((provider) => provider.kind === "rerank");

    expect(createdProvider).toMatchObject({
      baseUrl: "https://models.example.com/v1",
      displayName: "重排模型服务",
      kind: "rerank",
      maskedKeySuffix: "•••• 3456",
      modelId: "rerank-v2",
      provider: "Cohere Compatible",
      status: "enabled",
    });
    expect(created.auditEvents.slice(0, 2).map((event) => event.action)).toEqual([
      "provider.test_connection",
      "provider.create",
    ]);

    const updated = mockStoreReducer(created, {
      provider: {
        apiKey: "sk-rerank-9999",
        baseUrl: "https://models.example.com/v2",
        displayName: "重排模型服务 v2",
        id: createdProvider?.id ?? "",
        kind: "rerank",
        modelId: "rerank-v3",
        provider: "Cohere Compatible",
        status: "disabled",
      },
      type: "saveProviderConfig",
    });
    const updatedProvider = updated.providerConfigs.find((provider) => provider.kind === "rerank");

    expect(updatedProvider).toMatchObject({
      baseUrl: "https://models.example.com/v2",
      displayName: "重排模型服务 v2",
      maskedKeySuffix: "•••• 9999",
      modelId: "rerank-v3",
      status: "disabled",
    });
    expect(updatedProvider?.keyVersion).toBe((createdProvider?.keyVersion ?? 0) + 1);
    expect(updated.auditEvents.slice(0, 2).map((event) => event.action)).toEqual([
      "provider.test_connection",
      "provider.update",
    ]);
  });

  it("rejects provider creates that cannot pass the automatic connection test", () => {
    const seed = createSeedMockState();
    const withoutRerank = mockStoreReducer(seed, {
      providerId: "provider-rerank-main",
      type: "deleteProviderConfig",
    });
    const attempted = mockStoreReducer(withoutRerank, {
      provider: {
        apiKey: "",
        baseUrl: "not-a-url",
        displayName: "无效重排模型",
        kind: "rerank",
        modelId: "rerank-invalid",
        provider: "Cohere Compatible",
        status: "enabled",
      },
      type: "saveProviderConfig",
    });

    expect(attempted.providerConfigs.some((provider) => provider.kind === "rerank")).toBe(false);
    expect(attempted.auditEvents).toHaveLength(withoutRerank.auditEvents.length);
  });
});
