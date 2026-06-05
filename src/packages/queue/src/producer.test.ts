import { beforeEach, describe, expect, it, vi } from "vitest";

const bullMqMocks = vi.hoisted(() => {
  class MockBullMqJob {
    removeCallCount = 0;
    readonly retryCalls: {
      options: unknown;
      state: string | undefined;
    }[] = [];

    constructor(private readonly state: string) {}

    async getState(): Promise<string> {
      return this.state;
    }

    async retry(state?: string, options?: unknown): Promise<void> {
      this.retryCalls.push({
        options,
        state,
      });
    }

    async remove(): Promise<void> {
      this.removeCallCount += 1;
    }
  }

  class MockQueue {
    readonly addCalls: {
      data: unknown;
      name: string;
      options: unknown;
    }[] = [];
    closeCallCount = 0;
    readonly jobs = new Map<string, MockBullMqJob>();

    constructor(
      readonly name: string,
      readonly options: unknown,
    ) {
      bullMqMocks.queues.push(this);
    }

    async add(name: string, data: unknown, options: unknown): Promise<void> {
      this.addCalls.push({
        data,
        name,
        options,
      });
    }

    async close(): Promise<void> {
      this.closeCallCount += 1;
    }

    async getJob(jobId: string): Promise<MockBullMqJob | undefined> {
      return this.jobs.get(jobId);
    }
  }

  return {
    MockBullMqJob,
    MockQueue,
    queues: [] as MockQueue[],
  };
});

vi.mock("bullmq", () => ({
  Queue: bullMqMocks.MockQueue,
}));

import { createBullMqIngestionQueueProducer } from "./producer";
import { ingestionJobPayloadSchema } from "./schemas";

describe("BullMQ ingestion queue producer", () => {
  beforeEach(() => {
    bullMqMocks.queues.length = 0;
  });

  it("adds a new BullMQ ingestion job when no retained failed job exists", async () => {
    const producer = createBullMqIngestionQueueProducer({
      attempts: 3,
      backoffMs: 5_000,
      redisUrl: "redis://localhost:6379",
    });
    const queue = getOnlyQueue();
    const payload = ingestionJobPayloadSchema.parse({
      type: "file_ingestion",
      documentId: "doc_1",
      documentVersion: "v1",
      ingestionJobId: "job_1",
      knowledgeBaseId: "kb_1",
      requestedBy: "user_1",
      sourceObjectKey: "tenants/tenant_1/documents/doc_1/source.pdf",
      tenantId: "tenant_1",
    });

    await producer.enqueue(payload);

    expect(queue.addCalls).toEqual([
      {
        data: payload,
        name: "file_ingestion",
        options: {
          attempts: 3,
          backoff: {
            delay: 5_000,
            type: "exponential",
          },
          jobId: "ingestion__tenant_1__doc_1__v1",
          removeOnComplete: {
            count: 1_000,
          },
          removeOnFail: {
            count: 5_000,
          },
        },
      },
    ]);
  });

  it(
    "removes an existing failed BullMQ ingestion job before adding the current payload",
    async () => {
      const producer = createBullMqIngestionQueueProducer({
        attempts: 3,
        backoffMs: 5_000,
        redisUrl: "redis://localhost:6379",
      });
      const queue = getOnlyQueue();
      const payload = ingestionJobPayloadSchema.parse({
        type: "file_ingestion",
        documentId: "doc_1",
        documentVersion: "v1",
        ingestionJobId: "job_1",
        knowledgeBaseId: "kb_1",
        requestedBy: "user_1",
        sourceObjectKey: "tenants/tenant_1/documents/doc_1/source.pdf",
        tenantId: "tenant_1",
      });
      const failedJob = new bullMqMocks.MockBullMqJob("failed");
      queue.jobs.set("ingestion__tenant_1__doc_1__v1", failedJob);

      await producer.enqueue(payload);

      expect(failedJob.removeCallCount).toBe(1);
      expect(failedJob.retryCalls).toEqual([]);
      expect(queue.addCalls).toEqual([
        {
          data: payload,
          name: "file_ingestion",
          options: {
            attempts: 3,
            backoff: {
              delay: 5_000,
              type: "exponential",
            },
            jobId: "ingestion__tenant_1__doc_1__v1",
            removeOnComplete: {
              count: 1_000,
            },
            removeOnFail: {
              count: 5_000,
            },
          },
        },
      ]);
    },
  );
});

function getOnlyQueue(): InstanceType<typeof bullMqMocks.MockQueue> {
  const queue = bullMqMocks.queues[0];
  if (queue === undefined) {
    throw new Error("Expected a mocked BullMQ queue to be constructed.");
  }

  return queue;
}
