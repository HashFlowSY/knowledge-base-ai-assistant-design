"use client";

import { useState, type ReactElement } from "react";

import { useMockStore } from "../mock/store";
import type {
  MockProviderConfig,
  MockProviderConfigInput,
  MockProviderKind,
} from "../mock/types";
import { Button } from "../ui/button";
import { DialogFrame } from "../ui/dialog";
import type { FormSubmitHandler } from "../ui/form-types";
import { Notice } from "../ui/notice";
import { SelectField, type SelectFieldOption } from "../ui/select-field";
import { providerKindLabels } from "./admin-list-helpers";

export function ProviderConfigDialog({
  kind,
  onClose,
  onNotice,
  provider,
}: {
  kind: MockProviderKind;
  onClose: () => void;
  onNotice: (notice: string) => void;
  provider: MockProviderConfig | null;
}): ReactElement {
  const { dispatch } = useMockStore();
  const [displayName, setDisplayName] = useState(provider?.displayName ?? providerKindLabels[kind]);
  const [providerName, setProviderName] = useState(provider?.provider ?? providerNameForKind(kind));
  const [modelId, setModelId] = useState(provider?.modelId ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<Extract<MockProviderConfigInput["status"], "enabled" | "disabled">>(
    provider?.status === "disabled" ? "disabled" : "enabled",
  );
  const [error, setError] = useState<string | null>(null);
  const title = provider === null ? `配置${providerKindLabels[kind]}` : `编辑${providerKindLabels[kind]}`;

  const handleSubmit: FormSubmitHandler = (event) => {
    event.preventDefault();
    const validationError = validateProviderForm({
      apiKey,
      baseUrl,
      displayName,
      existingProvider: provider,
      modelId,
      providerName,
    });

    if (validationError !== null) {
      setError(validationError);
      return;
    }

    dispatch({
      provider: {
        apiKey,
        baseUrl: baseUrl.trim(),
        displayName: displayName.trim(),
        ...(provider === null ? {} : { id: provider.id }),
        kind,
        modelId: modelId.trim(),
        provider: providerName.trim(),
        status,
      },
      type: "saveProviderConfig",
    });
    onNotice(`${providerKindLabels[kind]}已保存，并完成连接测试。`);
    onClose();
  };

  return (
    <DialogFrame
      description="保存时会自动执行一次连接测试；API Key 不会回显，留空表示保持原密钥。"
      onClose={onClose}
      onSubmit={handleSubmit}
      title={title}
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        <Info label="模型类型" value={`${providerKindLabels[kind]} · ${kind}`} />
        <FormField label="服务名称" value={displayName} onChange={setDisplayName} />
        <FormField label="Provider" value={providerName} onChange={setProviderName} />
        <FormField label="模型 ID" value={modelId} onChange={setModelId} />
        <FormField label="Base URL" type="url" value={baseUrl} onChange={setBaseUrl} />
        <FormField
          label={provider === null ? "API Key" : "API Key（留空不修改）"}
          type="password"
          value={apiKey}
          onChange={setApiKey}
        />
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="provider-status">
            状态
          </label>
          <SelectField
            ariaLabel="模型服务状态"
            className="mt-2"
            onChange={(value) => setStatus(value as Extract<MockProviderConfigInput["status"], "enabled" | "disabled">)}
            options={toSelectOptions([["enabled", "启用"], ["disabled", "停用"]])}
            value={status}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary">
            保存并测试
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-800">{value}</p>
    </div>
  );
}

function FormField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: "password" | "text" | "url";
  value: string;
}): ReactElement {
  const id = `provider-${slugifyFieldId(label)}`;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <input
        className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </div>
  );
}

function providerNameForKind(kind: MockProviderKind): string {
  if (kind === "rerank") {
    return "Cohere Compatible";
  }

  return "OpenAI Compatible";
}

function validateProviderForm(input: {
  apiKey: string;
  baseUrl: string;
  displayName: string;
  existingProvider: MockProviderConfig | null;
  modelId: string;
  providerName: string;
}): string | null {
  if (input.displayName.trim().length === 0) {
    return "请输入服务名称。";
  }
  if (input.providerName.trim().length === 0) {
    return "请输入 Provider。";
  }
  if (input.modelId.trim().length === 0) {
    return "请输入模型 ID。";
  }
  if (!isValidHttpUrl(input.baseUrl.trim())) {
    return "请输入有效的 Base URL。";
  }
  if (input.existingProvider === null && input.apiKey.trim().length === 0) {
    return "新增模型服务必须输入 API Key。";
  }

  return null;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function slugifyFieldId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "field";
}

function toSelectOptions(options: [string, string][]): SelectFieldOption[] {
  return options.map(([value, label]) => ({ label, value }));
}
