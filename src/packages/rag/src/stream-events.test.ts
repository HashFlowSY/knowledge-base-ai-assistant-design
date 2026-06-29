import { describe, expect, it } from "vitest";

import {
  chatStreamEventSchema,
  createChatStreamEventId,
} from "./types";

describe("chat stream event contract", () => {
  it("validates traceable stream events and stable SSE event ids", () => {
    expect(createChatStreamEventId({ requestId: "req_1", sequence: 1 })).toBe(
      "req_1:1",
    );
    expect(() =>
      createChatStreamEventId({ requestId: "req_1", sequence: 0 }),
    ).toThrow();

    expect(
      chatStreamEventSchema.parse({
        event: "retrieval_started",
        data: {
          requestId: "req_1",
          retrievalRunId: "run_1",
          sessionId: "session_1",
          userMessageId: "msg_user",
        },
      }),
    ).toMatchObject({
      data: {
        requestId: "req_1",
        retrievalRunId: "run_1",
      },
      event: "retrieval_started",
    });
  });

  it("rejects malformed event payloads before API serialization", () => {
    expect(() =>
      chatStreamEventSchema.parse({
        event: "answer_delta",
        data: {
          delta: "token",
          requestId: "req_1",
          retrievalRunId: "run_1",
          sessionId: "session_1",
        },
      }),
    ).toThrow();
  });
});
