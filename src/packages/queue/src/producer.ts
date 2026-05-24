import { Queue } from "bullmq";

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
      await queue.add(
        parsed.type,
        parsed,
        createIngestionJobOptions(parsed, {
          attempts: config.attempts,
          backoffMs: config.backoffMs,
        }),
      );
    },
    async close() {
      await queue.close();
    },
  };
}

function createBullMqConnectionOptions(redisUrl: string): {
  db?: number;
  host: string;
  maxRetriesPerRequest: null;
  password?: string;
  port: number;
  username?: string;
} {
  const url = new URL(redisUrl);
  const dbPath = url.pathname.replace(/^\//, "");

  return {
    ...(dbPath.length === 0 ? {} : { db: Number.parseInt(dbPath, 10) }),
    host: url.hostname,
    maxRetriesPerRequest: null,
    ...(url.password.length === 0
      ? {}
      : { password: decodeURIComponent(url.password) }),
    port: url.port.length === 0 ? 6379 : Number.parseInt(url.port, 10),
    ...(url.username.length === 0
      ? {}
      : { username: decodeURIComponent(url.username) }),
  };
}
