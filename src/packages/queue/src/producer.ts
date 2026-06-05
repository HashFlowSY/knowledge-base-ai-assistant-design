import { Queue } from "bullmq";

import { createBullMqConnectionOptions } from "./connection";
import { createIngestionJobOptions } from "./options";
import { ingestionJobPayloadSchema, type IngestionJobPayload } from "./schemas";

export interface IngestionQueueProducerConfig {
  redisUrl: string;
  attempts: number;
  backoffMs: number;
}

export interface IngestionQueueProducer {
  enqueue(payload: IngestionJobPayload): Promise<void>;
  close(): Promise<void>;
}

export function createBullMqIngestionQueueProducer(
  config: IngestionQueueProducerConfig,
): IngestionQueueProducer {
  const queue = new Queue<IngestionJobPayload>("ingestion", {
    connection: createBullMqConnectionOptions(config.redisUrl),
  });

  return {
    async enqueue(payload) {
      const parsed = ingestionJobPayloadSchema.parse(payload);
      const jobOptions = createIngestionJobOptions(parsed, {
        attempts: config.attempts,
        backoffMs: config.backoffMs,
      });

      await removeFailedIngestionJobIfPresent(queue, jobOptions.jobId);

      await queue.add(
        parsed.type,
        parsed,
        jobOptions,
      );
    },
    async close() {
      await queue.close();
    },
  };
}

async function removeFailedIngestionJobIfPresent(
  queue: Queue<IngestionJobPayload>,
  jobId: string,
): Promise<void> {
  const existingJob = await queue.getJob(jobId);
  if (existingJob === undefined) {
    return;
  }

  const state = await existingJob.getState();
  if (state !== "failed") {
    return;
  }

  await existingJob.remove();
}
