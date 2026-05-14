import { createLogger, type Logger } from "@kb/observability";
import { queueNameSchema, type QueueName } from "@kb/queue";

export interface WorkerRuntimeState {
  service: "worker";
  status: "started" | "stopped";
  queues: QueueName[];
}

export interface WorkerRuntime {
  state: WorkerRuntimeState;
  stop(reason: string): Promise<WorkerRuntimeState>;
}

export async function startWorkerRuntime(
  options: {
    logger?: Logger;
    queues?: QueueName[];
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

  return {
    state,
    async stop(reason: string): Promise<WorkerRuntimeState> {
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
