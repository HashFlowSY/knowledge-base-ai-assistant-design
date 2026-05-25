import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import { uploadDocumentFileProcedure } from "./procedures/upload-document-file";
import type { DocumentsRouteDependencies } from "./dependencies";

export function createDocumentsRouter(
  dependencies: DocumentsRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();

  router.post("/api/knowledge-bases/:knowledgeBaseId/documents/upload", (context) =>
    uploadDocumentFileProcedure(context, dependencies),
  );

  return router;
}
