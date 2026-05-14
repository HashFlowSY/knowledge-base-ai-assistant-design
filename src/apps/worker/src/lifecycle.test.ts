import { describe, expect, it } from "vitest";

import { createLogger, type LogRecord } from "@kb/observability";

import { startWorkerRuntime } from "./lifecycle";

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
});
