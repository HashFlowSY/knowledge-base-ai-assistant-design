import { sql } from "drizzle-orm";

export type JsonObject = Record<string, unknown>;

export const emptyJsonObject = sql<JsonObject>`'{}'::jsonb`;
export const emptyJsonArray = sql<unknown[]>`'[]'::jsonb`;

export const vectorDimensions = {
  chunkEmbedding: 1024,
} as const;
