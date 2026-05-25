import type {
  UploadConcurrencyLimiter,
  UploadConcurrencyReservation,
} from "../../../contracts";

export function createInMemoryUploadConcurrencyLimiter(): UploadConcurrencyLimiter {
  const actorCounts = new Map<string, number>();
  const tenantCounts = new Map<string, number>();

  return {
    acquire(input) {
      const actorCount = actorCounts.get(input.actorKey) ?? 0;
      if (actorCount >= input.actorLimit) {
        return { ok: false, scope: "actor" };
      }

      const tenantCount = tenantCounts.get(input.tenantKey) ?? 0;
      if (tenantCount >= input.tenantLimit) {
        return { ok: false, scope: "tenant" };
      }

      actorCounts.set(input.actorKey, actorCount + 1);
      tenantCounts.set(input.tenantKey, tenantCount + 1);

      return {
        ok: true,
        reservation: createReservation(() => {
          decrement(actorCounts, input.actorKey);
          decrement(tenantCounts, input.tenantKey);
        }),
      };
    },
  };
}

function createReservation(releaseOnce: () => void): UploadConcurrencyReservation {
  let released = false;

  return {
    release() {
      if (released) {
        return;
      }

      released = true;
      releaseOnce();
    },
  };
}

function decrement(counts: Map<string, number>, key: string): void {
  const current = counts.get(key) ?? 0;
  if (current <= 1) {
    counts.delete(key);
    return;
  }

  counts.set(key, current - 1);
}
