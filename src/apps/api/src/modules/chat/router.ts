import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import {
  createJsonBodyValidationMiddleware,
  createJsonMutationGuardMiddleware,
  createKnowledgeBaseRejectionRateLimitHandler,
  createKnowledgeBaseSessionMiddleware,
  createQueryValidationMiddleware,
} from "../../middleware";
import type { ChatRouteDependencies } from "./dependencies";
import { createChatSessionProcedure } from "./procedures/create-session";
import { listChatMessagesProcedure } from "./procedures/list-messages";
import { listChatSessionsProcedure } from "./procedures/list-sessions";
import { submitAnswerFeedbackProcedure } from "./procedures/submit-feedback";
import { submitChatQuestionProcedure } from "./procedures/submit-question";
import {
  createChatSessionInputSchema,
  listChatSessionsQuerySchema,
  submitAnswerFeedbackInputSchema,
  submitChatQuestionInputSchema,
} from "./types";

export function createChatRouter(
  dependencies: ChatRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();
  const requireSession = createKnowledgeBaseSessionMiddleware({
    authService: dependencies.authService,
    rateLimiter: dependencies.rateLimiter,
  });
  const rejectWithKnowledgeBaseRateLimit =
    createKnowledgeBaseRejectionRateLimitHandler(dependencies.rateLimiter);
  const jsonMutationGuard = createJsonMutationGuardMiddleware({
    allowedOrigins: dependencies.allowedOrigins,
    onRejected: rejectWithKnowledgeBaseRateLimit,
  });

  router.get(
    "/api/chat/sessions",
    requireSession,
    createQueryValidationMiddleware(
      "listChatSessionsQuery",
      listChatSessionsQuerySchema,
    ),
    (context) => listChatSessionsProcedure(context, dependencies),
  );
  router.post(
    "/api/chat/sessions",
    jsonMutationGuard,
    requireSession,
    createJsonBodyValidationMiddleware(
      "createChatSessionBody",
      createChatSessionInputSchema,
    ),
    (context) => createChatSessionProcedure(context, dependencies),
  );
  router.get("/api/chat/sessions/:sessionId/messages", requireSession, (context) =>
    listChatMessagesProcedure(context, dependencies),
  );
  router.post(
    "/api/chat/messages",
    jsonMutationGuard,
    requireSession,
    createJsonBodyValidationMiddleware(
      "submitChatQuestionBody",
      submitChatQuestionInputSchema,
    ),
    (context) => submitChatQuestionProcedure(context, dependencies),
  );
  router.post(
    "/api/chat/messages/:messageId/feedback",
    jsonMutationGuard,
    requireSession,
    createJsonBodyValidationMiddleware(
      "submitAnswerFeedbackBody",
      submitAnswerFeedbackInputSchema,
    ),
    (context) => submitAnswerFeedbackProcedure(context, dependencies),
  );

  return router;
}
