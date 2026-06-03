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
  const recoveryInterval =
    recovery === undefined
      ? null
      : setInterval(() => {
          void runRecovery(recovery, logger);
        }, recovery.intervalMs ?? 300_000);
  if (recovery !== undefined) {
    await runRecovery(recovery, logger);
  }

  return {
    state,
    async stop(reason: string): Promise<WorkerRuntimeState> {
      if (recoveryInterval !== null) {
        clearInterval(recoveryInterval);
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
