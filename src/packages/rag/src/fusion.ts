import type {
  FusedRetrievalCandidate,
  RetrievalSourceCandidate,
} from "./types";

const rrfK = 60;

export function fuseRetrievalCandidates(input: {
  vector: RetrievalSourceCandidate[];
  keyword: RetrievalSourceCandidate[];
  fusedLimit: number;
}): FusedRetrievalCandidate[] {
  const candidates = new Map<string, FusedRetrievalCandidate>();

  addSourceCandidates({
    candidates,
    items: rankByScore(input.vector),
    source: "vector",
  });
  addSourceCandidates({
    candidates,
    items: rankByScore(input.keyword),
    source: "keyword",
  });

  return Array.from(candidates.values())
    .sort((left, right) => {
      if (right.fusedScore !== left.fusedScore) {
        return right.fusedScore - left.fusedScore;
      }

      return left.chunkId.localeCompare(right.chunkId);
    })
    .slice(0, input.fusedLimit);
}

function addSourceCandidates(input: {
  candidates: Map<string, FusedRetrievalCandidate>;
  items: (RetrievalSourceCandidate & { rank: number })[];
  source: "vector" | "keyword";
}): void {
  for (const item of input.items) {
    const existing = input.candidates.get(item.chunkId);
    const rrfScore = 1 / (rrfK + item.rank);

    if (existing === undefined) {
      input.candidates.set(item.chunkId, {
        chunkId: item.chunkId,
        chunkIndex: item.chunkIndex,
        content: item.content,
        documentId: item.documentId,
        documentTitle: item.documentTitle,
        fusedScore: rrfScore,
        knowledgeBaseId: item.knowledgeBaseId,
        metadata: item.metadata,
        source: input.source,
        sourceLocator: item.sourceLocator,
        sourceUri: item.sourceUri,
        tokenEstimate: item.tokenEstimate,
        ...(input.source === "vector"
          ? { vectorRank: item.rank, vectorScore: item.score }
          : { keywordRank: item.rank, keywordScore: item.score }),
      });
      continue;
    }

    input.candidates.set(item.chunkId, {
      ...existing,
      fusedScore: existing.fusedScore + rrfScore,
      source: "hybrid",
      ...(input.source === "vector"
        ? { vectorRank: item.rank, vectorScore: item.score }
        : { keywordRank: item.rank, keywordScore: item.score }),
    });
  }
}

function rankByScore(
  candidates: RetrievalSourceCandidate[],
): (RetrievalSourceCandidate & { rank: number })[] {
  return [...candidates]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.chunkId.localeCompare(right.chunkId);
    })
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}
