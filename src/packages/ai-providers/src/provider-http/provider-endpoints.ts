import type { ProviderConnectionTestInput } from "../shared/service-types";

export const dashScopeNativeEmbeddingPath =
  "/api/v1/services/embeddings/text-embedding/text-embedding";
export const dashScopeNativeRerankPath =
  "/api/v1/services/rerank/text-rerank/text-rerank";
const dashScopeCompatibleRerankPath = "/compatible-api/v1/reranks";

export function createEndpointUrl(baseUrl: string, endpointPath: string): string {
  const url = new URL(baseUrl);
  const normalizedEndpointPath = normalizeEndpointPath(endpointPath);
  const basePath = url.pathname.replace(/\/+$/, "");

  url.search = "";
  url.hash = "";
  if (basePath === normalizedEndpointPath || basePath.endsWith(normalizedEndpointPath)) {
    return url.toString();
  }

  url.pathname = `${basePath}/${normalizedEndpointPath.slice(1)}`;
  return url.toString();
}

export function createDashScopeEndpointUrl(
  baseUrl: string,
  endpointPath: string,
): string {
  const url = new URL(baseUrl);
  const normalizedEndpointPath = normalizeEndpointPath(endpointPath);
  const basePath = url.pathname.replace(/\/+$/, "");

  url.search = "";
  url.hash = "";
  if (
    basePath === normalizedEndpointPath ||
    basePath.endsWith(normalizedEndpointPath)
  ) {
    return url.toString();
  }

  url.pathname = normalizedEndpointPath;
  return url.toString();
}

export function getRerankBaseUrl(input: ProviderConnectionTestInput): string {
  if (!isDashScopeProvider(input)) {
    return input.baseUrl;
  }

  const url = new URL(input.baseUrl);
  url.pathname = getDashScopeCompatibleApiPath(url.pathname);

  return url.toString();
}

export function isDashScopeNativeBaseUrl(baseUrl: string): boolean {
  const path = new URL(baseUrl).pathname.replace(/\/+$/, "");

  return path === "/api/v1" || path.includes("/api/v1/services/");
}

export function isDashScopeNativeRerankModel(modelId: string): boolean {
  const model = modelId.toLowerCase();

  return model.includes("gte-rerank") || model.includes("qwen3-vl-rerank");
}

export function isDeepSeekProvider(input: ProviderConnectionTestInput): boolean {
  return normalizeProviderIdentity(input).includes("deepseek");
}

export function isDashScopeProvider(input: ProviderConnectionTestInput): boolean {
  const identity = normalizeProviderIdentity(input);

  return (
    identity.includes("dashscope") ||
    identity.includes("bailian") ||
    identity.includes("aliyun") ||
    identity.includes("gte-rerank") ||
    identity.includes("qwen") ||
    identity.includes("百炼") ||
    identity.includes("通义")
  );
}

function normalizeEndpointPath(endpointPath: string): string {
  return `/${endpointPath.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function getDashScopeCompatibleApiPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "");

  if (path === "/compatible-api/v1" || path.endsWith(dashScopeCompatibleRerankPath)) {
    return path;
  }

  if (path.includes("/compatible-mode/v1") || path.includes("/api/v1")) {
    return path
      .replace("/compatible-mode/v1", "/compatible-api/v1")
      .replace("/api/v1", "/compatible-api/v1");
  }

  return "/compatible-api/v1";
}

function normalizeProviderIdentity(input: ProviderConnectionTestInput): string {
  return `${input.provider} ${input.modelId} ${input.baseUrl}`.toLowerCase();
}
