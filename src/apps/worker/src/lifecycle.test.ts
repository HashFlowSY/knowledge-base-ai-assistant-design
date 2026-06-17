import { afterEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";

import { internalError, rateLimited } from "@kb/errors";
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

  it("keeps recovery running when source cleanup throws and logs safe error fields", async () => {
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
          throw new Error("source cleanup failed for tenants/tenant_1/private.pdf");
        },
      },
    });

    await runtime.stop("test");

    expect(recovered).toEqual([1]);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "worker_source_cleanup_failed",
        fields: {
          taskName: "source_cleanup",
          error: "Worker task failed.",
          stack: expect.any(String),
        },
        level: "error",
      }),
    );
    expect(JSON.stringify(records)).not.toContain("tenant_1");
    expect(JSON.stringify(records)).not.toContain("private.pdf");
  });

  it("logs recovery interval failures with safe AppError fields", async () => {
    vi.useFakeTimers();
    const records: LogRecord[] = [];
    const logger = createLogger({ service: "worker" }, (record) => records.push(record));
    const runtime = await startWorkerRuntime({
      logger,
      recovery: {
        intervalMs: 50,
        run: vi
          .fn()
          .mockResolvedValueOnce({ enqueued: 0 })
          .mockRejectedValueOnce(
            rateLimited(
              {
                domain: "queue",
                reason: "recovery_rate_limited",
                message: "Queue recovery was rate limited.",
                metadata: {
                  queueName: "ingestion",
                  operation: "recover_ingestion_jobs",
                },
                retryAfterSeconds: 30,
              },
              { cause: new Error("upstream throttled") },
            ),
          ),
      },
    });

    await vi.advanceTimersByTimeAsync(50);
    await runtime.stop("test");

    expect(records).toContainEqual(
      expect.objectContaining({
        event: "worker_recovery_failed",
        fields: {
          code: "RATE_LIMITED",
          httpStatus: 429,
          domain: "queue",
          reason: "recovery_rate_limited",
          retryable: false,
          metadata: {
            queueName: "ingestion",
            operation: "recover_ingestion_jobs",
          },
          error: "Queue recovery was rate limited.",
          stack: expect.any(String),
        },
        level: "error",
      }),
    );
    expect(JSON.stringify(records)).not.toContain("responseHeaders");
    expect(JSON.stringify(records)).not.toContain("retryAfterSeconds");
  });

  it("logs source cleanup failures with safe non-AppError fields", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ service: "worker" }, (record) => records.push(record));
    const runtime = await startWorkerRuntime({
      logger,
      sourceCleanup: {
        intervalMs: 60_000,
        run: async () => {
          throw new Error(
            "cleanup failed for tenants/tenant_1/private.pdf token=secret_token requestBody={}",
          );
        },
      },
    });

    await runtime.stop("test");

    expect(records).toContainEqual(
      expect.objectContaining({
        event: "worker_source_cleanup_failed",
        fields: {
          taskName: "source_cleanup",
          error: "Worker task failed.",
          stack: expect.any(String),
        },
        level: "error",
      }),
    );
    expect(JSON.stringify(records)).not.toContain("tenant_1");
    expect(JSON.stringify(records)).not.toContain("private.pdf");
    expect(JSON.stringify(records)).not.toContain("secret_token");
    expect(JSON.stringify(records)).not.toContain("requestBody");
  });

  it("logs source cleanup AppError failures without response headers", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ service: "worker" }, (record) => records.push(record));
    const runtime = await startWorkerRuntime({
      logger,
      sourceCleanup: {
        intervalMs: 60_000,
        run: async () => {
          throw internalError({
            domain: "auth",
            reason: "source_cleanup_failed",
            message: "Source cleanup failed.",
            metadata: {
              operation: "cleanup_uploaded_sources",
              queueName: "maintenance",
            },
            responseHeaders: {
              setCookie: ["better-auth.session_token=; Max-Age=0"],
            },
          });
        },
      },
    });

    await runtime.stop("test");

    expect(records).toContainEqual(
      expect.objectContaining({
        event: "worker_source_cleanup_failed",
        fields: {
          code: "INTERNAL_ERROR",
          httpStatus: 500,
          domain: "auth",
          reason: "source_cleanup_failed",
          retryable: false,
          metadata: {
            operation: "cleanup_uploaded_sources",
            queueName: "maintenance",
          },
          error: "Source cleanup failed.",
          stack: expect.any(String),
        },
        level: "error",
      }),
    );
    expect(JSON.stringify(records)).not.toContain("responseHeaders");
    expect(JSON.stringify(records)).not.toContain("setCookie");
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
