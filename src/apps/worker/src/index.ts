import path from "node:path";
import { fileURLToPath } from "node:url";

import { QueueEvents, Worker } from "bullmq";
import { config as loadEnv } from "dotenv";

import { createEmbeddingService, createDrizzleProviderConfigRepository } from "@kb/ai-providers/service";
import { loadRuntimeConfig } from "@kb/config";
import { createPostgresJsDatabase, databaseConfigSchema } from "@kb/db";
import {
  cleanupPendingSourceObjects,
  createDrizzleIngestionRepository,
  createIngestionPipeline,
  recoverIngestionJobs,
} from "@kb/ingestion";
import {
  createBullMqIngestionQueueProducer,
} from "@kb/queue/producer";
import {
  createBullMqConnectionOptions,
  ingestionJobPayloadSchema,
  type IngestionJobPayload,
} from "@kb/queue";
import { normalizeAes256GcmKey } from "@kb/security";
import { createMeiliSearchIndexWriter } from "@kb/search";
import {
  createS3ObjectStorageClient,
  objectStorageConfigSchema,
} from "@kb/storage";

import { handleIngestionPipelineResult, startWorkerRuntime } from "./lifecycle";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

loadEnv({ path: path.join(repoRoot, ".env") });

const config = loadRuntimeConfig(process.env);
const dbRuntime = createPostgresJsDatabase(
  databaseConfigSchema.parse({
    databaseUrl: config.DATABASE_URL,
  }),
);
const objectStorage = createS3ObjectStorageClient(
  objectStorageConfigSchema.parse({
    accessKeyId: config.S3_ACCESS_KEY_ID,
    bucket: config.S3_BUCKET,
    endpoint: config.S3_ENDPOINT,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  }),
);
const repository = createDrizzleIngestionRepository({
  db: dbRuntime.db,
  objectStorage,
});
const queueProducer = createBullMqIngestionQueueProducer({
  attempts: config.INGESTION_QUEUE_ATTEMPTS,
  backoffMs: config.INGESTION_QUEUE_BACKOFF_MS,
  redisUrl: config.REDIS_URL,
});
const embeddingService = createEmbeddingService({
  encryptionKey: normalizeAes256GcmKey(config.APP_ENCRYPTION_KEY),
  repository: createDrizzleProviderConfigRepository(dbRuntime.db),
});
const pipeline = createIngestionPipeline({
  chunking: {
    chunkOverlap: config.INGESTION_CHUNK_OVERLAP,
    chunkSize: config.INGESTION_CHUNK_SIZE,
  },
  embeddingService,
  indexWriter: createMeiliSearchIndexWriter({
    apiKey: config.MEILISEARCH_MASTER_KEY,
    host: config.MEILISEARCH_HOST,
  }),
  repository,
});
const bullMqConnection = createBullMqConnectionOptions(config.REDIS_URL);
const ingestionWorker = new Worker<IngestionJobPayload>(
  "ingestion",
  async (job) => {
    const payload = ingestionJobPayloadSchema.parse(job.data);
    if (payload.type !== "file_ingestion") {
      throw new Error("URL ingestion is out of scope for this worker.");
    }

    return handleIngestionPipelineResult(
      await pipeline.processFileIngestion(payload),
    );
  },
  {
    concurrency: config.WORKER_CONCURRENCY,
    connection: bullMqConnection,
  },
);
const ingestionEvents = new QueueEvents("ingestion", {
  connection: bullMqConnection,
});

const runtime = await startWorkerRuntime({
  recovery: {
    intervalMs: config.INGESTION_REQUEUE_STALE_AFTER_MS,
    run: () =>
      recoverIngestionJobs({
        batchSize: config.INGESTION_REQUEUE_BATCH_SIZE,
        producer: queueProducer,
        repository,
        staleAfterMs: config.INGESTION_REQUEUE_STALE_AFTER_MS,
      }),
  },
  sourceCleanup: {
    intervalMs: config.INGESTION_REQUEUE_STALE_AFTER_MS,
    run: () =>
      cleanupPendingSourceObjects({
        batchSize: config.INGESTION_REQUEUE_BATCH_SIZE,
        objectStorage,
        repository,
        staleAfterMs: config.INGESTION_REQUEUE_STALE_AFTER_MS,
      }),
  },
  resources: [
    {
      name: "ingestion-worker",
      close: () => ingestionWorker.close(),
    },
    {
      name: "ingestion-events",
      close: () => ingestionEvents.close(),
    },
    {
      name: "ingestion-queue-producer",
      close: () => queueProducer.close(),
    },
    {
      name: "database",
      close: () => dbRuntime.pool.end(),
    },
  ],
});

const shutdown = async (reason: string): Promise<void> => {
  await runtime.stop(reason);
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
