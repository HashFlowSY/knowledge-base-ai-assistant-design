import type {
  RagContextCitation,
  RagContextItem,
  RankedRetrievalCandidate,
} from "./types";

export function assembleRagContext(input: {
  candidates: RankedRetrievalCandidate[];
  maxChunks: number;
  maxContextTokens: number;
}): {
  citations: RagContextCitation[];
  items: RagContextItem[];
  usedTokenEstimate: number;
} {
  const selected: RankedRetrievalCandidate[] = [];
  let usedTokenEstimate = 0;

  for (const candidate of [...input.candidates].sort((left, right) => left.rank - right.rank)) {
    if (selected.length >= input.maxChunks) {
      break;
    }

    const nextTokenEstimate = usedTokenEstimate + candidate.tokenEstimate;
    if (nextTokenEstimate > input.maxContextTokens) {
      break;
    }

    selected.push(candidate);
    usedTokenEstimate = nextTokenEstimate;
  }

  return {
    citations: selected.map(createContextCitation),
    items: mergeAdjacentContextItems(selected),
    usedTokenEstimate,
  };
}

function mergeAdjacentContextItems(
  candidates: RankedRetrievalCandidate[],
): RagContextItem[] {
  const items: (RagContextItem & { lastChunkIndex: number })[] = [];

  for (const candidate of candidates) {
    const previous = items[items.length - 1];
    if (previous !== undefined && canMerge(previous, candidate)) {
      items[items.length - 1] = {
        ...previous,
        chunkIds: [...previous.chunkIds, candidate.chunkId],
        content: `${previous.content}\n\n${candidate.content}`,
        lastChunkIndex: candidate.chunkIndex,
        tokenEstimate: previous.tokenEstimate + candidate.tokenEstimate,
      };
      continue;
    }

    items.push({
      chunkIds: [candidate.chunkId],
      content: candidate.content,
      documentId: candidate.documentId,
      knowledgeBaseId: candidate.knowledgeBaseId,
      lastChunkIndex: candidate.chunkIndex,
      rank: candidate.rank,
      sourceLocator: candidate.sourceLocator,
      sourceTitle: candidate.documentTitle,
      sourceUri: candidate.sourceUri,
      tokenEstimate: candidate.tokenEstimate,
    });
  }

  return items.map((item) => ({
    chunkIds: item.chunkIds,
    content: item.content,
    documentId: item.documentId,
    knowledgeBaseId: item.knowledgeBaseId,
    rank: item.rank,
    sourceLocator: item.sourceLocator,
    sourceTitle: item.sourceTitle,
    sourceUri: item.sourceUri,
    tokenEstimate: item.tokenEstimate,
  }));
}

function canMerge(
  previous: RagContextItem & { lastChunkIndex: number },
  candidate: RankedRetrievalCandidate,
): boolean {
  return (
    previous.documentId === candidate.documentId &&
    candidate.chunkIndex === previous.lastChunkIndex + 1
  );
}

function createContextCitation(
  candidate: RankedRetrievalCandidate,
): RagContextCitation {
  return {
    chunkId: candidate.chunkId,
    documentId: candidate.documentId,
    knowledgeBaseId: candidate.knowledgeBaseId,
    rank: candidate.rank,
    snippet: candidate.content.slice(0, 240),
    sourceLocator: candidate.sourceLocator,
    sourceTitle: candidate.documentTitle,
    sourceUri: candidate.sourceUri,
  };
}
