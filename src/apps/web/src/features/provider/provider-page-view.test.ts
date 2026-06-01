import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { ProviderSummary } from "@kb/ai-providers";

import {
  providerFormStatusForSave,
  providerListColumnLabels,
  providerRowView,
} from "./provider-page-view";

describe("provider page view", () => {
  it("keeps the restored provider list free of secret and status columns", () => {
    expect(providerListColumnLabels).toEqual([
      "类型 / 名称",
      "Provider",
      "模型 ID",
      "Base URL",
      "更新时间",
      "操作",
    ]);
    expect(providerListColumnLabels).not.toContain("状态");
    expect(providerListColumnLabels).not.toContain("密钥");

    const view = providerRowView(
      providerSummary({
        maskedKey: "•••• A91C",
        status: "enabled",
      }),
    );
    const serialized = JSON.stringify(view);

    expect(view.actionLabel).toBe("编辑");
    expect(serialized).toContain("deepseek");
    expect(serialized).toContain("deepseek-chat");
    expect(serialized).not.toContain("•••• A91C");
    expect(serialized).not.toContain("enabled");
    expect(serialized).not.toContain("启用");
  });

  it("defaults missing provider rows without leaking secret or status placeholders", () => {
    const view = providerRowView(
      providerSummary({
        baseUrl: null,
        configured: false,
        displayName: null,
        id: null,
        maskedKey: null,
        modelId: null,
        provider: null,
        status: null,
        updatedAt: null,
      }),
    );

    expect(view.title).toBe("问答模型");
    expect(view.providerName).toBe("-");
    expect(view.modelId).toBe("-");
    expect(view.baseUrl).toBe("-");
    expect(view.updatedAt).toBe("未保存");
    expect(view.actionLabel).toBe("配置");
    expect(JSON.stringify(view)).not.toContain("密钥");
    expect(JSON.stringify(view)).not.toContain("状态");
  });

  it("keeps status hidden in the form while preserving the backend save value", () => {
    expect(providerFormStatusForSave(providerSummary({ status: "disabled" }))).toBe("disabled");
    expect(providerFormStatusForSave(providerSummary({ configured: false, status: null }))).toBe("enabled");
  });

  it("does not render status controls in the provider config dialog source", () => {
    const source = readFileSync(resolve(__dirname, "provider-config-dialog.tsx"), "utf8");

    expect(source).toContain("API Key");
    expect(source).not.toContain("模型服务状态");
    expect(source).not.toContain("provider-status");
    expect(source).not.toContain("SelectField");
  });
});

function providerSummary(overrides: Partial<ProviderSummary> = {}): ProviderSummary {
  return {
    baseUrl: "https://api.deepseek.com",
    configured: true,
    displayName: "主问答模型服务",
    id: "provider-chat",
    kind: "chat",
    label: "问答模型",
    maskedKey: null,
    modelId: "deepseek-chat",
    provider: "deepseek",
    status: "enabled",
    updatedAt: "2026-05-24T00:00:00.000Z",
    keyVersion: "1",
    ...overrides,
  };
}
