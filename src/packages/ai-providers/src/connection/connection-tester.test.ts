import { describe, expect, it } from "vitest";

import { createProviderConnectionTester } from "../service";
import { connectionInput } from "../testing/service.test-helpers";

describe("provider connection tester", () => {
  it("checks DeepSeek credentials with the models endpoint instead of the bare base URL", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const tester = createProviderConnectionTester({
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      },
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://api.deepseek.com",
          kind: "chat",
          modelId: "deepseek-chat",
          provider: "deepseek",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.deepseek.com/models");
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: "Bearer sk-live-provider-key",
    });
  });

  it("checks Alibaba Bailian credentials with each slot's real capability endpoint", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const tester = createProviderConnectionTester({
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      },
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "chat",
          modelId: "qwen-plus",
          provider: "阿里云百炼",
        }),
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "embedding",
          modelId: "text-embedding-v4",
          provider: "dashscope",
        }),
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "rerank",
          modelId: "qwen3-rerank",
          provider: "bailian",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls.map((call) => call.url)).toEqual([
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
      "https://dashscope.aliyuncs.com/compatible-api/v1/reranks",
    ]);
    expect(calls.map((call) => call.init.method)).toEqual(["POST", "POST", "POST"]);
    expect(calls.map((call) => call.init.headers)).toEqual([
      {
        accept: "application/json",
        authorization: "Bearer sk-live-provider-key",
        "content-type": "application/json",
      },
      {
        accept: "application/json",
        authorization: "Bearer sk-live-provider-key",
        "content-type": "application/json",
      },
      {
        accept: "application/json",
        authorization: "Bearer sk-live-provider-key",
        "content-type": "application/json",
      },
    ]);
    expect(calls.map((call) => JSON.parse(String(call.init.body)))).toEqual([
      {
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
        model: "qwen-plus",
        stream: false,
      },
      {
        dimensions: 1024,
        encoding_format: "float",
        input: "ping",
        model: "text-embedding-v4",
      },
      {
        documents: ["ping", "pong"],
        model: "qwen3-rerank",
        query: "ping",
        top_n: 1,
      },
    ]);
  });

  it("checks DashScope native embedding when the configured base URL is api/v1", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const tester = createProviderConnectionTester({
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      },
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/api/v1",
          kind: "embedding",
          modelId: "text-embedding-v3",
          provider: "dashscope",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
    );
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "text-embedding-v3",
      input: {
        texts: ["ping"],
      },
      parameters: {
        dimension: 1024,
        output_type: "dense",
      },
    });
  });

  it("checks gte-rerank-v2 with DashScope native rerank endpoint and payload", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const tester = createProviderConnectionTester({
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      },
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "rerank",
          modelId: "gte-rerank-v2",
          provider: "gte-rerank-v2",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
    );
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "gte-rerank-v2",
      input: {
        query: "ping",
        documents: ["ping", "pong"],
      },
      parameters: {
        top_n: 1,
      },
    });
  });

  it("normalizes failed provider status codes without leaking provider response bodies", async () => {
    const tester = createProviderConnectionTester({
      fetcher: async () =>
        new Response(JSON.stringify({ error: { message: "raw secret detail" } }), {
          status: 401,
        }),
    });

    await expect(
      tester(
        connectionInput({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          kind: "embedding",
          modelId: "text-embedding-v4",
          provider: "dashscope",
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "PROVIDER_AUTH_FAILED",
      message: "模型服务认证失败。",
    });
  });
});
