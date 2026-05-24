import type { ProviderStatus, ProviderSummary } from "@kb/ai-providers";

export const providerListColumnLabels = [
  "类型 / 名称",
  "Provider",
  "模型 ID",
  "Base URL",
  "更新时间",
  "操作",
] as const;

export interface ProviderRowView {
  actionLabel: "编辑" | "配置";
  baseUrl: string;
  modelId: string;
  providerName: string;
  subtitle: string;
  title: string;
  updatedAt: string;
}

export function providerRowView(provider: ProviderSummary): ProviderRowView {
  return {
    actionLabel: provider.configured ? "编辑" : "配置",
    baseUrl: provider.baseUrl ?? "-",
    modelId: provider.modelId ?? "-",
    providerName: provider.provider ?? "-",
    subtitle: provider.configured ? provider.label : "未配置",
    title: provider.displayName ?? provider.label,
    updatedAt: provider.updatedAt?.slice(0, 10) ?? "未保存",
  };
}

export function providerFormStatusForSave(provider: ProviderSummary): ProviderStatus {
  return provider.configured && provider.status === "disabled" ? "disabled" : "enabled";
}
