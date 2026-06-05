import { createSearchIndexDocument } from "@kb/search";

import type { ParsedDocument } from "../contracts/schemas";
import type {
  IngestionPipeline,
  IngestionPipelineOptions,
} from "../contracts/types";
import { chunkParsedDocument } from "../chunking/chunker";
import { parseDocument } from "../parsing/parser";
import { normalizeParsedText } from "../parsing/text";
import { embedChunksInBatches } from "./embedding-batches";
import {
  failPipelineJob,
  normalizePipelineError,
  recordStep,
  shouldRetryPipelineFailure,
} from "./steps";

export function createIngestionPipeline(
  options: IngestionPipelineOptions,
): IngestionPipeline {
  return {
    async processFileIngestion(payload) {
      const claim = await options.repository.claimFileJob(payload);
      if (claim.status === "already_claimed") {
        return {
          reason: "already_claimed",
          status: "skipped",
        };
      }

      const context = claim.context;

      try {
        await recordStep(options.repository, context, "source_connector", "started");
        const source = await options.repository.loadFileSource(context);
        await recordStep(options.repository, context, "source_connector", "succeeded");

        await recordStep(options.repository, context, "parser", "started");
        const parsed = await parseDocument({
          body: source.body,
          mimeType: source.mimeType,
          originalFilename: source.originalFilename,
        });
        await recordStep(options.repository, context, "parser", "succeeded");

        await recordStep(options.repository, context, "normalizer", "started");
        const normalizedDocument: ParsedDocument = {
          ...parsed,
          text: normalizeParsedText(parsed.text),
        };
        await recordStep(options.repository, context, "normalizer", "succeeded");

        await recordStep(options.repository, context, "chunker", "started");
        const chunks = await chunkParsedDocument({
          chunkOverlap: options.chunking.chunkOverlap,
          chunkSize: options.chunking.chunkSize,
          document: normalizedDocument,
        });
        await recordStep(options.repository, context, "chunker", "succeeded", {
          chunkCount: chunks.length,
        });

        await recordStep(options.repository, context, "embedding", "started");
        const embeddingResult = await embedChunksInBatches({
          chunks,
          embeddingService: options.embeddingService,
          onProgress: (progress) =>
            recordStep(
              options.repository,
              context,
              "embedding",
              "progress",
              progress,
            ),
          requestId: context.ingestionJobId,
          tenantId: context.tenantId,
        });
        if (!embeddingResult.ok) {
          const shouldRetry = shouldRetryPipelineFailure(
            context,
            embeddingResult.retryable,
          );
          await failPipelineJob(options.repository, context, {
            code: embeddingResult.code,
            message: embeddingResult.message,
            retryable: embeddingResult.retryable,
            shouldRetry,
            step: "embedding",
          });
          return {
            code: embeddingResult.code,
            message: embeddingResult.message,
            retryable: embeddingResult.retryable,
            shouldRetry,
            status: "failed",
          };
        }
        await recordStep(options.repository, context, "embedding", "succeeded", {
          chunkCount: chunks.length,
          embeddedCount: embeddingResult.embeddings.length,
        });

        const persistedOutput = await options.repository.persistIngestionOutput({
          chunks,
          context,
          embeddings: embeddingResult.embeddings,
        });
        const persistedChunkIdByIndex = new Map(
          persistedOutput.chunks.map((chunk) => [chunk.chunkIndex, chunk.id]),
        );

        await recordStep(options.repository, context, "index_writer", "started");
        await options.indexWriter.indexDocuments({
          documents: chunks.map((chunk) => {
            const chunkId = persistedChunkIdByIndex.get(chunk.chunkIndex);
            if (chunkId === undefined) {
              throw new Error("Persisted chunk id missing for search index.");
            }

            return createSearchIndexDocument({
              chunkId,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              documentId: context.documentId,
              documentVersion: context.documentVersion,
              knowledgeBaseId: context.knowledgeBaseId,
              metadata: chunk.metadata,
              sourceLocator: chunk.sourceLocator,
              tenantId: context.tenantId,
            });
          }),
        });
        await recordStep(options.repository, context, "index_writer", "succeeded");

        await options.repository.completeJob({
          documentVersion: context.documentVersion,
          ingestionJobId: context.ingestionJobId,
        });

        return { status: "completed" };
      } catch (error) {
        const normalized = normalizePipelineError(error);
        const shouldRetry = shouldRetryPipelineFailure(
          context,
          normalized.retryable,
        );
        await failPipelineJob(options.repository, context, {
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
          shouldRetry,
        });

        return {
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
          shouldRetry,
          status: "failed",
        };
      }
    },
  };
}
