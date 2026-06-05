import type { EmbeddingServiceResult } from "@kb/ai-providers/service";

import type {
  ChunkEmbeddingDraft,
  DocumentChunkDraft,
  IngestionEmbeddingService,
} from "../contracts/types";

const defaultEmbeddingBatchSize = 10;

export async function embedChunksInBatches(input: {
  chunks: DocumentChunkDraft[];
  embeddingService: IngestionEmbeddingService;
  onProgress?: (progress: {
    chunkCount: number;
    embeddedCount: number;
  }) => Promise<void>;
  requestId: string;
  tenantId: string;
}): Promise<
  | { ok: true; embeddings: ChunkEmbeddingDraft[] }
  | Extract<EmbeddingServiceResult, { ok: false }>
> {
  const embeddings: ChunkEmbeddingDraft[] = [];

  for (
    let startIndex = 0;
    startIndex < input.chunks.length;
    startIndex += defaultEmbeddingBatchSize
  ) {
    const batch = input.chunks.slice(
      startIndex,
      startIndex + defaultEmbeddingBatchSize,
    );
    const batchResult = await input.embeddingService.embed({
      inputs: batch.map((chunk) => chunk.content),
      requestId: input.requestId,
      tenantId: input.tenantId,
    });
    if (!batchResult.ok) {
      return batchResult;
    }

    embeddings.push(
      ...batch.map((chunk, batchIndex) => ({
        chunkIndex: chunk.chunkIndex,
        contentHash: chunk.contentHash,
        dimensions: batchResult.dimensions,
        embedding: batchResult.vectors[batchIndex] ?? [],
        modelId: batchResult.modelId,
        providerId: batchResult.providerConfigId,
      })),
    );
    if (input.chunks.length > defaultEmbeddingBatchSize) {
      await input.onProgress?.({
        chunkCount: input.chunks.length,
        embeddedCount: embeddings.length,
      });
    }
  }

  return {
    embeddings,
    ok: true,
  };
}
