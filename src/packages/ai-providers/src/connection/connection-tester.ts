import {
  createDashScopeEndpointUrl,
  createEndpointUrl,
  dashScopeNativeEmbeddingPath,
  dashScopeNativeRerankPath,
  getRerankBaseUrl,
  isDashScopeNativeBaseUrl,
  isDashScopeNativeRerankModel,
  isDashScopeProvider,
  isDeepSeekProvider,
} from "../provider-http/provider-endpoints";
import { isAbortError } from "../shared/provider-service-errors";
import type {
  ProviderConnectionTestInput,
  ProviderConnectionTestResult,
  ProviderConnectionTesterOptions,
} from "../shared/service-types";

interface ProviderConnectionRequest {
  url: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
}

export function createProviderConnectionTester(
  options: ProviderConnectionTesterOptions = {},
): (input: ProviderConnectionTestInput) => Promise<ProviderConnectionTestResult> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return async (input) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const request = createProviderConnectionRequest(input);
      const headers: Record<string, string> = {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
      };
      const requestInit: RequestInit = {
        headers,
        method: request.method,
        signal: controller.signal,
      };
      if (request.body !== undefined) {
        headers["content-type"] = "application/json";
        requestInit.body = JSON.stringify(request.body);
      }

      const response = await fetcher(request.url, requestInit);
      return normalizeProviderConnectionResponse(response.status);
    } catch (error) {
      if (isAbortError(error)) {
        return {
          ok: false,
          code: "PROVIDER_TIMEOUT",
          message: "模型服务连接超时。",
        };
      }

      return {
        ok: false,
        code: "PROVIDER_UNAVAILABLE",
        message: "模型服务暂时不可用。",
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function normalizeProviderConnectionResponse(
  status: number,
): ProviderConnectionTestResult {
  if (status >= 200 && status < 300) {
    return { ok: true };
  }

  if (status === 401 || status === 403) {
    return {
      ok: false,
      code: "PROVIDER_AUTH_FAILED",
      message: "模型服务认证失败。",
    };
  }

  if (status === 429) {
    return {
      ok: false,
      code: "PROVIDER_RATE_LIMITED",
      message: "模型服务请求过于频繁。",
    };
  }

  if (status === 408) {
    return {
      ok: false,
      code: "PROVIDER_TIMEOUT",
      message: "模型服务连接超时。",
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      code: "PROVIDER_UNAVAILABLE",
      message: "模型服务暂时不可用。",
    };
  }

  return {
    ok: false,
    code: "PROVIDER_INVALID_REQUEST",
    message: "模型服务连接测试失败。",
  };
}

function createProviderConnectionRequest(
  input: ProviderConnectionTestInput,
): ProviderConnectionRequest {
  if (input.kind === "chat" && isDeepSeekProvider(input)) {
    return {
      method: "GET",
      url: createEndpointUrl(input.baseUrl, "/models"),
    };
  }

  if (input.kind === "chat") {
    return {
      body: {
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
        model: input.modelId,
        stream: false,
      },
      method: "POST",
      url: createEndpointUrl(input.baseUrl, "/chat/completions"),
    };
  }

  if (input.kind === "embedding") {
    if (isDashScopeProvider(input) && isDashScopeNativeBaseUrl(input.baseUrl)) {
      return {
        body: {
          model: input.modelId,
          input: {
            texts: ["ping"],
          },
          parameters: {
            dimension: 1024,
            output_type: "dense",
          },
        },
        method: "POST",
        url: createDashScopeEndpointUrl(input.baseUrl, dashScopeNativeEmbeddingPath),
      };
    }

    return {
      body: {
        dimensions: 1024,
        encoding_format: "float",
        input: "ping",
        model: input.modelId,
      },
      method: "POST",
      url: createEndpointUrl(input.baseUrl, "/embeddings"),
    };
  }

  if (isDashScopeProvider(input) && isDashScopeNativeRerankModel(input.modelId)) {
    return {
      body: {
        model: input.modelId,
        input: {
          query: "ping",
          documents: ["ping", "pong"],
        },
        parameters: {
          top_n: 1,
        },
      },
      method: "POST",
      url: createDashScopeEndpointUrl(input.baseUrl, dashScopeNativeRerankPath),
    };
  }

  return {
    body: {
      documents: ["ping", "pong"],
      model: input.modelId,
      query: "ping",
      top_n: 1,
    },
    method: "POST",
    url: createEndpointUrl(getRerankBaseUrl(input), "/reranks"),
  };
}
