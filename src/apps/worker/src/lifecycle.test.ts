import { describe, expect, it } from "vitest";
import { UnrecoverableError } from "bullmq";

import { createLogger, type LogRecord } from "@kb/observability";

import { handleIngestionPipelineResult, startWorkerRuntime } from "./lifecycle";

describe("@kb/worker", () => {
  it("starts and stops with structured lifecycle logs", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ service: "worker" }, (record) => records.push(record));
    const runtime = await startWorkerRuntime({ logger });
    const stopped = await runtime.stop("test");

    expect(runtime.state).toMatchObject({
      service: "worker",
      status: "started",
      queues: ["ingestion"],
    });
    expect(stopped.status).toBe("stopped");
    expect(records.map((record) => record.event)).toEqual([
      "worker_started",
      "worker_stopped",
    ]);
  });

  it("runs recovery on startup and closes managed resources on stop", async () => {
    const closed: string[] = [];
    const recovered: number[] = [];
    const runtime = await startWorkerRuntime({
      resources: [
        {
          name: "ingestion-worker",
          close: async () => {
            closed.push("ingestion-worker");
          },
        },
        {
          name: "ingestion-events",
          close: async () => {
            closed.push("ingestion-events");
          },
        },
      ],
      recovery: {
        intervalMs: 60_000,
        run: async () => {
          recovered.push(1);
          return { enqueued: 2 };
        },
      },
    });

    await runtime.stop("test");

    expect(recovered).toEqual([1]);
    expect(closed).toEqual(["ingestion-worker", "ingestion-events"]);
  });

  it("throws retryable pipeline failures so BullMQ can retry the job", () => {
    expect(() =>
      handleIngestionPipelineResult({
        code: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
        message: "未配置可用的向量模型服务。",
        retryable: true,
        shouldRetry: true,
        status: "failed",
      }),
    ).toThrow("未配置可用的向量模型服务。");
  });

  it("throws unrecoverable pipeline failures when attempts are exhausted", () => {
    expect(() =>
      handleIngestionPipelineResult({
        code: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
        message: "未配置可用的向量模型服务。",
        retryable: true,
        shouldRetry: false,
        status: "failed",
      }),
    ).toThrow(UnrecoverableError);
  });
});
