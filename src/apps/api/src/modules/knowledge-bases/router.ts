import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import { createKnowledgeBaseProcedure } from "./procedures/create-knowledge-base";
import { getKnowledgeBaseProcedure } from "./procedures/get-knowledge-base";
import { listKnowledgeBasesProcedure } from "./procedures/list-knowledge-bases";
import { updateKnowledgeBaseProcedure } from "./procedures/update-knowledge-base";
import type { KnowledgeBaseRouteDependencies } from "./dependencies";

export function createKnowledgeBasesRouter(
  dependencies: KnowledgeBaseRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();

  router.get("/api/knowledge-bases", (context) =>
    listKnowledgeBasesProcedure(context, dependencies),
  );
  router.post("/api/knowledge-bases", (context) =>
    createKnowledgeBaseProcedure(context, dependencies),
  );
  router.get("/api/knowledge-bases/:knowledgeBaseId", (context) =>
    getKnowledgeBaseProcedure(context, dependencies),
  );
  router.patch("/api/knowledge-bases/:knowledgeBaseId", (context) =>
    updateKnowledgeBaseProcedure(context, dependencies),
  );

  return router;
}
