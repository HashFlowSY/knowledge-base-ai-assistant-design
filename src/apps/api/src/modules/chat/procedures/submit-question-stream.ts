import type { Context } from "hono";

import {
  chatStreamEventSchema,
  createChatStreamEventId,
  type ChatStreamEvent,
} from "@kb/rag";

import type { ApiEnv } from "../../../contracts";
import { getRequiredActor, getValidatedInput } from "../../../middleware";
import type { ChatRouteDependencies } from "../dependencies";
import type { SubmitChatQuestionInput } from "../types";

export async function submitChatQuestionStreamProcedure(
  context: Context<ApiEnv>,
  dependencies: ChatRouteDependencies,
): Promise<Response> {
  const requestId = context.get("requestId");
  const events = dependencies.chatService.streamQuestion({
    actor: getRequiredActor(context),
    body: getValidatedInput<SubmitChatQuestionInput>(
      context,
      "submitChatQuestionBody",
    ),
    requestId,
    signal: context.req.raw.signal,
  });
  const iterator = events[Symbol.asyncIterator]();
  const first = await iterator.next();

  if (first.done) {
    return new Response(null, {
      headers: {
        "X-Request-Id": requestId,
      },
      status: 204,
    });
  }

  let sequence = 1;
  let deliveryOpen = true;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueueEvent = (event: ChatStreamEvent): void => {
        if (!deliveryOpen || context.req.raw.signal.aborted) {
          return;
        }

        try {
          const parsed = chatStreamEventSchema.parse(event);
          const eventId = createChatStreamEventId({ requestId, sequence });
          sequence += 1;
          controller.enqueue(
            encoder.encode(
              `id: ${eventId}\nevent: ${parsed.event}\ndata: ${JSON.stringify(parsed.data)}\n\n`,
            ),
          );
        } catch {
          deliveryOpen = false;
        }
      };

      try {
        enqueueEvent(first.value);

        while (true) {
          const next = await iterator.next();
          if (next.done) {
            break;
          }
          enqueueEvent(next.value);
        }
      } catch {
        enqueueEvent({
          event: "error",
          data: {
            code: "stream_failed",
            message: "操作失败，请稍后重试。",
            requestId,
          },
        });
      } finally {
        if (deliveryOpen) {
          try {
            controller.close();
          } catch {
            deliveryOpen = false;
          }
        }
      }
    },
    cancel() {
      deliveryOpen = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Request-Id": requestId,
    },
    status: 200,
  });
}
