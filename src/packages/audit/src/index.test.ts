import { describe, expect, it } from "vitest";

import { auditEventSchema } from "./index";

describe("@kb/audit", () => {
  it("accepts system audit events with ISO timestamps", () => {
    expect(
      auditEventSchema.parse({
        tenantId: "tenant_1",
        action: "worker.started",
        targetType: "worker",
        targetId: "worker",
        actor: { actorType: "system" },
        timestamp: "2026-05-14T00:00:00.000Z",
      }),
    ).toMatchObject({
      metadata: {},
    });
  });
});
