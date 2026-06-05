import { Hono } from "hono";

import type { ApiEnv } from "../../contracts";
import { listDocumentProcessingProcedure } from "./procedures/list-document-processing";
import { retryDocumentProcessingProcedure } from "./procedures/retry-document-processing";
import { uploadDocumentFileProcedure } from "./procedures/upload-document-file";
import type { DocumentsRouteDependencies } from "./dependencies";

export function createDocumentsRouter(
  dependencies: DocumentsRouteDependencies,
): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();

  router.post("/api/knowledge-bases/:knowledgeBaseId/documents/upload", (context) =>
    uploadDocumentFileProcedure(context, dependencies),
  );
  router.get(
    "/api/knowledge-bases/:knowledgeBaseId/documents/processing",
    (context) => listDocumentProcessingProcedure(context, dependencies),
  );
  router.post(
    "/api/knowledge-bases/:knowledgeBaseId/documents/:documentId/retry",
    (context) => retryDocumentProcessingProcedure(context, dependencies),
  );

  return router;
}
