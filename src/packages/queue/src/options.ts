import type { IngestionJobPayload } from "./schemas";
import { createIngestionJobId } from "./job-id";

export interface IngestionQueueOptionsConfig {
  attempts: number;
  backoffMs: number;
}

export interface IngestionJobOptions {
  attempts: number;
  backoff: {
    type: "exponential";
    delay: number;
  };
  jobId: string;
  removeOnComplete: {
    count: 1_000;
  };
  removeOnFail: {
    count: 5_000;
  };
}

export function createIngestionJobOptions(
  payload: IngestionJobPayload,
  config: IngestionQueueOptionsConfig,
): IngestionJobOptions {
  return {
    attempts: config.attempts,
    backoff: {
      delay: config.backoffMs,
      type: "exponential",
    },
    jobId: createIngestionJobId(payload),
    removeOnComplete: {
      count: 1_000,
    },
    removeOnFail: {
      count: 5_000,
    },
  };
}
