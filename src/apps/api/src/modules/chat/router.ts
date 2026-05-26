import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import type { ChatRouteDependencies } from "./dependencies";
import { createChatSessionProcedure } from "./procedures/create-session";
import { listChatMessagesProcedure } from "./procedures/list-messages";
import { listChatSessionsProcedure } from "./procedures/list-sessions";
import { submitAnswerFeedbackProcedure } from "./procedures/submit-feedback";
import { submitChatQuestionProcedure } from "./procedures/submit-question";

export function createChatRouter(
  dependencies: ChatRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();

  router.get("/api/chat/sessions", (context) =>
    listChatSessionsProcedure(context, dependencies),
  );
  router.post("/api/chat/sessions", (context) =>
    createChatSessionProcedure(context, dependencies),
  );
  router.get("/api/chat/sessions/:sessionId/messages", (context) =>
    listChatMessagesProcedure(context, dependencies),
  );
  router.post("/api/chat/messages", (context) =>
    submitChatQuestionProcedure(context, dependencies),
  );
  router.post("/api/chat/messages/:messageId/feedback", (context) =>
    submitAnswerFeedbackProcedure(context, dependencies),
  );

  return router;
}
