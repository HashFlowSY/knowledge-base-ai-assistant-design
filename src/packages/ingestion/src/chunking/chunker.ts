import { createHash } from "node:crypto";

import { IngestionError } from "../contracts/errors";
import type {
  ChunkParsedDocumentInput,
  DocumentChunkDraft,
} from "../contracts/types";
import { adjustOverlapStart, chooseChunkEnd } from "./boundaries";

export async function chunkParsedDocument(
  input: ChunkParsedDocumentInput,
): Promise<DocumentChunkDraft[]> {
  validateChunkingConfig(input);

  const text = input.document.text;
  const chunks: DocumentChunkDraft[] = [];
  let start = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + input.chunkSize, text.length);
    const end =
      hardEnd === text.length
        ? hardEnd
        : chooseChunkEnd({
            format: input.document.format,
            hardEnd,
            start,
            text,
          });
    const rawContent = text.slice(start, end);
    const content = rawContent.trim();
    if (content.length > 0) {
      chunks.push({
        chunkIndex: chunks.length,
        content,
        contentHash: sha256Hex(content),
        metadata: {
          format: input.document.format,
          sourceStart: start,
          sourceEnd: end,
        },
        sourceLocator: `chars:${start}-${end}`,
        tokenEstimate: estimateTokens(content),
      });
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = adjustOverlapStart({
      proposedStart: Math.max(0, end - input.chunkOverlap),
      text,
    });
    start = nextStart <= start ? end : nextStart;
  }

  return chunks;
}

function validateChunkingConfig(input: ChunkParsedDocumentInput): void {
  if (
    !Number.isInteger(input.chunkSize) ||
    input.chunkSize <= 0 ||
    !Number.isInteger(input.chunkOverlap) ||
    input.chunkOverlap < 0 ||
    input.chunkOverlap >= input.chunkSize
  ) {
    throw new IngestionError({
      code: "INVALID_CHUNKING_CONFIG",
      message: "Chunk size and overlap are invalid.",
      retryable: false,
    });
  }
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
