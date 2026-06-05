import { afterEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";

import { createLogger, type LogRecord } from "@kb/observability";

import { handleIngestionPipelineResult, startWorkerRuntime } from "./lifecycle";

describe("@kb/worker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("runs recovery and source cleanup on startup and closes managed resources on stop", async () => {
    const closed: string[] = [];
    const recovered: number[] = [];
    const cleanups: number[] = [];
    const records: LogRecord[] = [];
    const logger = createLogger({ service: "worker" }, (record) => records.push(record));
    const runtime = await startWorkerRuntime({
      logger,
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
      sourceCleanup: {
        intervalMs: 60_000,
        run: async () => {
          cleanups.push(1);
          return { cleaned: 3, failed: 1 };
        },
      },
    });

    await runtime.stop("test");

    expect(recovered).toEqual([1]);
    expect(cleanups).toEqual([1]);
    expect(closed).toEqual(["ingestion-worker", "ingestion-events"]);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "worker_source_cleanup_completed",
        fields: {
          cleaned: 3,
          failed: 1,
        },
        level: "warn",
      }),
    );
  });

  it("continues source cleanup on the configured interval", async () => {
    vi.useFakeTimers();
    const cleanups: number[] = [];
    const runtime = await startWorkerRuntime({
      sourceCleanup: {
        intervalMs: 50,
        run: async () => {
          cleanups.push(1);
          return { cleaned: 0, failed: 0 };
        },
      },
    });

    expect(cleanups).toEqual([1]);

    await vi.advanceTimersByTimeAsync(50);

    expect(cleanups).toEqual([1, 1]);

    await runtime.stop("test");
  });

  it("does not start overlapping source cleanup interval runs", async () => {
    vi.useFakeTimers();
    let cleanupCalls = 0;
    let releaseSecondRun = (): void => {
      throw new Error("Second cleanup run was not started.");
    };
    const runtime = await startWorkerRuntime({
      sourceCleanup: {
        intervalMs: 50,
        run: async () => {
          cleanupCalls += 1;
          if (cleanupCalls === 2) {
            await new Promise<void>((resolve) => {
              releaseSecondRun = resolve;
            });
          }

          return { cleaned: 0, failed: 0 };
        },
      },
    });

    expect(cleanupCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(cleanupCalls).toBe(2);

    await vi.advanceTimersByTimeAsync(50);
    expect(cleanupCalls).toBe(2);

    releaseSecondRun();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(50);

    expect(cleanupCalls).toBe(3);

    await runtime.stop("test");
  });

  it("keeps recovery running when source cleanup throws and logs only a safe summary", async () => {
    const records: LogRecord[] = [];
    const recovered: number[] = [];
    const logger = createLogger({ service: "worker" }, (record) => records.push(record));
    const runtime = await startWorkerRuntime({
      logger,
      recovery: {
        intervalMs: 60_000,
        run: async () => {
          recovered.push(1);
          return { enqueued: 2 };
        },
      },
      sourceCleanup: {
        intervalMs: 60_000,
        run: async () => {
          throw new Error("raw object key tenants/tenant-1/private.pdf");
        },
      },
    });

    await runtime.stop("test");

    expect(recovered).toEqual([1]);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "worker_source_cleanup_failed",
        fields: {
          failed: 1,
        },
        level: "error",
      }),
    );
    expect(JSON.stringify(records)).not.toContain("tenants/tenant-1/private.pdf");
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
