import type { IngestionRecoveryOptions } from "../contracts/types";

export async function recoverIngestionJobs(
  options: IngestionRecoveryOptions,
): Promise<{ enqueued: number }> {
  const now = options.now ?? (() => new Date());
  const updatedBefore = new Date(now().getTime() - options.staleAfterMs);
  const payloads = await options.repository.listRecoverableFileJobs({
    limit: options.batchSize,
    updatedBefore,
  });

  for (const payload of payloads) {
    await options.producer.enqueue(payload);
  }

  return {
    enqueued: payloads.length,
  };
}
