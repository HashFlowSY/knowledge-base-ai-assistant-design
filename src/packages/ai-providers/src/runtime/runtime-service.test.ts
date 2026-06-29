import { describe, expect, it } from "vitest";

import {
  createInMemoryProviderConfigRepository,
  createProviderConfigService,
} from "../service";
import {
  actor,
  alwaysPassConnectionTester,
  encryptionKey,
  saveBody,
} from "../testing/service.test-helpers";
import {
  createProviderChatService,
  type ProviderChatStreamEvent,
} from "./runtime-service";

describe("provider chat runtime streaming", () => {
  it("parses OpenAI-compatible split SSE deltas and DONE frames", async () => {
    const calls: { init: RequestInit; url: string }[] = [];
    const service = await createConfiguredChatRuntime(async (url, init) => {
      if (init === undefined) {
        throw new Error("Expected provider fetch init.");
      }
      calls.push({ init, url: String(url) });
      return new Response(
        streamFrom([
          'data: {"choices":[{"delta":{"content":"你好"}}]}\n',
          "\n",
          'data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
        { status: 200 },
      );
    });

    const events = await collectProviderEvents(
      service.stream({
        messages: [{ role: "user", content: "ping" }],
        requestId: "req_stream",
        tenantId: actor.tenant.id,
      }),
    );

    expect(events).toEqual([
      { type: "delta", text: "你好" },
      { type: "delta", text: "，世界" },
      { type: "done" },
    ]);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      stream: true,
    });
  });

  it("ignores empty deltas and treats iterator EOF as provider completion", async () => {
    const service = await createConfiguredChatRuntime(async () =>
      new Response(
        streamFrom([
          'data: {"choices":[{"delta":{}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"完成"}}]}\n\n',
        ]),
        { status: 200 },
      ),
    );

    await expect(
      collectProviderEvents(
        service.stream({
          messages: [{ role: "user", content: "ping" }],
          requestId: "req_eof",
          tenantId: actor.tenant.id,
        }),
      ),
    ).resolves.toEqual([
      { type: "delta", text: "完成" },
      { type: "done" },
    ]);
  });

  it("maps malformed stream JSON to a normalized provider error", async () => {
    const service = await createConfiguredChatRuntime(async () =>
      new Response(streamFrom(["data: {not-json}\n\n"]), { status: 200 }),
    );

    await expect(
      collectProviderEvents(
        service.stream({
          messages: [{ role: "user", content: "ping" }],
          requestId: "req_bad_json",
          tenantId: actor.tenant.id,
        }),
      ),
    ).resolves.toEqual([
      { type: "error", code: "PROVIDER_INVALID_REQUEST" },
    ]);
  });

  it("maps non-2xx streaming responses without exposing provider raw bodies", async () => {
    const service = await createConfiguredChatRuntime(async () =>
      new Response("secret raw provider body", { status: 429 }),
    );

    await expect(
      collectProviderEvents(
        service.stream({
          messages: [{ role: "user", content: "ping" }],
          requestId: "req_429",
          tenantId: actor.tenant.id,
        }),
      ),
    ).resolves.toEqual([
      { type: "error", code: "PROVIDER_RATE_LIMITED" },
    ]);
  });

  it("combines the caller abort signal with the provider fetch signal", async () => {
    const controller = new AbortController();
    const observed: { providerSignal?: AbortSignal } = {};
    const service = await createConfiguredChatRuntime(async (_url, init) => {
      if (init === undefined) {
        throw new Error("Expected provider fetch init.");
      }
      if (init.signal instanceof AbortSignal) {
        observed.providerSignal = init.signal;
      }
      controller.abort();
      return new Response(
        streamFrom(['data: {"choices":[{"delta":{"content":"late"}}]}\n\n']),
        { status: 200 },
      );
    });

    const events = await collectProviderEvents(
      service.stream({
        messages: [{ role: "user", content: "ping" }],
        requestId: "req_abort",
        signal: controller.signal,
        tenantId: actor.tenant.id,
      }),
    );

    if (observed.providerSignal === undefined) {
      throw new Error("Expected provider abort signal.");
    }
    expect(observed.providerSignal.aborted).toBe(true);
    expect(events).toEqual([
      { type: "error", code: "PROVIDER_UNAVAILABLE" },
    ]);
  });
});

async function createConfiguredChatRuntime(fetcher: typeof fetch): Promise<
  ReturnType<typeof createProviderChatService>
> {
  const repository = createInMemoryProviderConfigRepository();
  const configService = createProviderConfigService({
    connectionTester: alwaysPassConnectionTester(),
    encryptionKey,
    repository,
  });

  await configService.saveProviderConfig({
    actor,
    body: saveBody({
      apiKey: { mode: "plaintext", value: "sk-live-provider-key" },
    }),
    kind: "chat",
    requestId: "req_configure_chat",
  });

  return createProviderChatService({
    encryptionKey,
    fetcher,
    repository,
  });
}

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collectProviderEvents(
  stream: AsyncIterable<ProviderChatStreamEvent>,
): Promise<ProviderChatStreamEvent[]> {
  const events: ProviderChatStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}
