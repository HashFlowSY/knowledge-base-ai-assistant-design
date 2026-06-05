import { UnrecoverableError } from "bullmq";

import { createLogger, type Logger } from "@kb/observability";
import { queueNameSchema, type QueueName } from "@kb/queue";
import type { IngestionPipelineResult } from "@kb/ingestion";

export interface WorkerRuntimeState {
  service: "worker";
  status: "started" | "stopped";
  queues: QueueName[];
}

export interface WorkerRuntime {
  state: WorkerRuntimeState;
  stop(reason: string): Promise<WorkerRuntimeState>;
}

export interface WorkerManagedResource {
  name: string;
  close(): Promise<void>;
}

export interface WorkerRecoveryRunner {
  intervalMs?: number;
  run(): Promise<{ enqueued: number }>;
}

export interface WorkerSourceCleanupRunner {
  intervalMs?: number;
  run(): Promise<{ cleaned: number; failed: number }>;
}

export function handleIngestionPipelineResult(
  result: IngestionPipelineResult,
): IngestionPipelineResult {
  if (result.status !== "failed") {
    return result;
  }

  const message = result.message || result.code;
  if (result.shouldRetry) {
    throw new Error(message);
  }

  throw new UnrecoverableError(message);
}

export async function startWorkerRuntime(
  options: {
    logger?: Logger;
    queues?: QueueName[];
    recovery?: WorkerRecoveryRunner;
    resources?: WorkerManagedResource[];
    sourceCleanup?: WorkerSourceCleanupRunner;
  } = {},
): Promise<WorkerRuntime> {
  const logger = options.logger ?? createLogger({ service: "worker" });
  const queues = (options.queues ?? ["ingestion"]).map((queueName) =>
    queueNameSchema.parse(queueName),
  );
  const state: WorkerRuntimeState = {
    service: "worker",
    status: "started",
    queues,
  };

  logger.info("worker_started", {
    queues,
  });

  const resources = options.resources ?? [];
  const recovery = options.recovery;
  const sourceCleanup = options.sourceCleanup;
  let sourceCleanupRunning = false;
  const runSourceCleanupOnce = async (): Promise<void> => {
    if (sourceCleanup === undefined || sourceCleanupRunning) {
      return;
    }

    sourceCleanupRunning = true;
    try {
      await runSourceCleanup(sourceCleanup, logger);
    } finally {
      sourceCleanupRunning = false;
    }
  };
  const recoveryInterval =
    recovery === undefined
      ? null
      : setInterval(() => {
          void runRecovery(recovery, logger);
        }, recovery.intervalMs ?? 300_000);
  const sourceCleanupInterval =
    sourceCleanup === undefined
      ? null
      : setInterval(() => {
          void runSourceCleanupOnce();
        }, sourceCleanup.intervalMs ?? recovery?.intervalMs ?? 300_000);
  if (recovery !== undefined) {
    await runRecovery(recovery, logger);
  }
  if (sourceCleanup !== undefined) {
    await runSourceCleanupOnce();
  }

  return {
    state,
    async stop(reason: string): Promise<WorkerRuntimeState> {
      if (recoveryInterval !== null) {
        clearInterval(recoveryInterval);
      }
      if (sourceCleanupInterval !== null) {
        clearInterval(sourceCleanupInterval);
      }
      for (const resource of resources) {
        await resource.close();
      }

      const stoppedState: WorkerRuntimeState = {
        ...state,
        status: "stopped",
      };

      logger.info("worker_stopped", {
        reason,
        queues,
      });

      return stoppedState;
    },
  };
}

async function runRecovery(
  recovery: WorkerRecoveryRunner,
  logger: Logger,
): Promise<void> {
  const result = await recovery.run();
  logger.info("worker_recovery_completed", {
    enqueued: result.enqueued,
  });
}

async function runSourceCleanup(
  sourceCleanup: WorkerSourceCleanupRunner,
  logger: Logger,
): Promise<void> {
  try {
    const result = await sourceCleanup.run();
    const eventFields = {
      cleaned: result.cleaned,
      failed: result.failed,
    };
    if (result.failed > 0) {
      logger.warn("worker_source_cleanup_completed", eventFields);
      return;
    }

    logger.info("worker_source_cleanup_completed", eventFields);
  } catch {
    logger.error("worker_source_cleanup_failed", {
      failed: 1,
    });
  }
}
