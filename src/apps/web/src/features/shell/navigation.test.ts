import { describe, expect, it } from "vitest";

import { commonCopy, domainTerms } from "../../copy/common";
import { adminCopy } from "../../copy/admin";
import { authCopy } from "../../copy/auth";
import { chatCopy } from "../../copy/chat";
import { knowledgeCopy } from "../../copy/knowledge";
import { shellSkeletonVariantForPath } from "../ui/skeleton-variants";
import { visibleNavigationItems } from "./navigation";

describe("@kb/web frontend MVP static contracts", () => {
  it("keeps required Chinese domain terms centralized", () => {
    expect(domainTerms).toEqual({
      audit: "审计日志",
      citation: "引用",
      document: "文档",
      feedback: "反馈",
      key: "密钥",
      knowledgeBase: "知识库",
      processingLog: "处理日志",
      provider: "模型服务",
      task: "任务",
    });
    expect(commonCopy.productName).toBe("知识库 AI 助手");
    expect(authCopy.title).toBe("登录知识库 AI 助手");
    expect(knowledgeCopy.workspaceTitle).toBe("知识库工作台");
    expect(chatCopy.citationPanel).toBe("引用核验");
    expect(adminCopy.providers.title).toBe("模型服务");
  });

  it("hides admin navigation for member role", () => {
    expect(visibleNavigationItems("admin").map((item) => item.href)).toEqual([
      "/workspace",
      "/documents",
      "/chat",
      "/tasks",
      "/logs",
      "/providers",
      "/users",
      "/audit",
    ]);
    expect(visibleNavigationItems("member").map((item) => item.href)).toEqual([
      "/workspace",
      "/documents",
      "/chat",
      "/tasks",
    ]);
  });

  it("maps protected route gates to layout-shaped skeleton variants", () => {
    expect(shellSkeletonVariantForPath("/workspace")).toBe("workspace");
    expect(shellSkeletonVariantForPath("/chat?sessionId=session-finance-001")).toBe("chat");
    expect(shellSkeletonVariantForPath("/documents")).toBe("table");
    expect(shellSkeletonVariantForPath("/documents/doc-travel-policy")).toBe("document");
    expect(shellSkeletonVariantForPath("/documents/doc-travel-policy?chunkId=chunk-travel-001")).toBe(
      "document",
    );
    expect(shellSkeletonVariantForPath("/providers/provider-openai-main")).toBe("table");
  });
});
