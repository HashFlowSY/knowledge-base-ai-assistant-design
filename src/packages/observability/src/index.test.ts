import { describe, expect, it } from "vitest";

import {
  createJsonConsoleLogSink,
  createLogger,
  redactLogFields,
  type LogRecord,
} from "./index";

describe("@kb/observability", () => {
  it("redacts known secret-bearing fields", () => {
    expect(
      redactLogFields({
        databaseUrl: "postgres://user:pass@localhost/db",
        action: "health.check",
      }),
    ).toEqual({
      databaseUrl: "[REDACTED]",
      action: "health.check",
    });
  });

  it("emits structured records through the configured sink", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ service: "worker" }, (record) => records.push(record));

    logger.info("worker_started", { jobId: "job_1" });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      service: "worker",
      level: "info",
      event: "worker_started",
      fields: { jobId: "job_1" },
    });
  });

  it("provides a JSON console sink for runtime entrypoints", () => {
    const writes: string[] = [];
    const sink = createJsonConsoleLogSink({
      write(chunk) {
        writes.push(String(chunk));
        return true;
      },
    });

    sink({
      timestamp: "2026-05-25T00:00:00.000Z",
      level: "info",
      event: "api_started",
      service: "api",
      fields: { requestId: "req_1" },
    });

    expect(JSON.parse(writes[0] ?? "")).toMatchObject({
      event: "api_started",
      fields: { requestId: "req_1" },
      level: "info",
      service: "api",
    });
  });
});
