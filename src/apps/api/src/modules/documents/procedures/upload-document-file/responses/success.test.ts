import { describe, expect, it } from "vitest";

import { internalError } from "@kb/errors";
import { documentFileUploadResultSchema } from "@kb/knowledge";
import { apiErrorResponseSchema, apiSuccessResponseSchema } from "@kb/shared";

import {
  createApiApp,
  type DocumentFileUploadServiceInput,
} from "../../../../../app";
import {
  adminSession,
  createFile,
  createStaticAuthService,
  createUploadRequest,
  createUploadResult,
  documentUploadPath,
  knowledgeBaseId,
  uploadConfig,
} from "../support/test-helpers";

describe("document upload API successful responses", () => {
  it("uploads one validated file and defaults a blank title from the filename", async () => {
    const capturedInputs: DocumentFileUploadServiceInput[] = [];
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile(input) {
          capturedInputs.push(input);
          return {
            ok: true,
            result: createUploadResult({
              title: input.title,
              sourceHash: input.checksum,
              sizeBytes: input.sizeBytes,
            }),
          };
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "300",
        file: createFile(
          "%PDF-1.4\nhello",
          "Quarterly Policy.pdf",
          "application/pdf",
        ),
        requestId: "req_upload_success",
        title: "   ",
      }),
    );

    expect(response.status).toBe(201);
    const parsed = apiSuccessResponseSchema(documentFileUploadResultSchema).parse(
      await response.json(),
    );
    expect(parsed.data.document.title).toBe("Quarterly Policy");
    expect(parsed.data.duplicate).toBe(false);
    const capturedInput = capturedInputs[0];
    if (capturedInput === undefined) {
      throw new Error("document service was not called");
    }

    expect(capturedInput.actor).toEqual({
      role: "admin",
      tenant: { id: "tenant_1" },
      user: { id: "admin_1" },
    });
    expect(capturedInput).toMatchObject({
      knowledgeBaseId,
      mimeType: "application/pdf",
      originalFilename: "Quarterly Policy.pdf",
      sizeBytes: 14,
      title: "Quarterly Policy",
    });
    expect(capturedInput.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("returns 200 when duplicate content is ignored by the document service", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile(input) {
          return {
            ok: true,
            result: {
              ...createUploadResult({
                title: input.title,
                sourceHash: input.checksum,
                sizeBytes: input.sizeBytes,
              }),
              duplicate: true,
            },
          };
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_duplicate",
      }),
    );

    expect(response.status).toBe(200);
    expect(
      apiSuccessResponseSchema(documentFileUploadResultSchema).parse(
        await response.json(),
      ).data.duplicate,
    ).toBe(true);
  });

  it("lets document service AppError flow through the global error handler", async () => {
    const app = createApiApp({
      authService: createStaticAuthService(adminSession),
      documentService: {
        async uploadDocumentFile() {
          throw internalError({
            domain: "knowledge",
            reason: "object_upload_failed",
            message: "操作失败，请稍后重试。",
          });
        },
      },
      uploadConfig,
    });

    const response = await app.request(
      documentUploadPath,
      createUploadRequest({
        contentLength: "300",
        file: createFile("%PDF-1.4\nhello", "policy.pdf", "application/pdf"),
        requestId: "req_upload_service_error",
      }),
    );

    expect(response.status).toBe(500);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      requestId: "req_upload_service_error",
    });
  });
});
