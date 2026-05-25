import { describe, expect, it } from "vitest";

import type { SessionPayload } from "@kb/auth";

import { toKnowledgeActor } from "./actors";

describe("actor guards", () => {
  it("maps auth session payloads to narrow knowledge actors", () => {
    const knowledgeActor = toKnowledgeActor({
      user: { id: "admin_1", name: "Admin", email: "admin@example.com" },
      tenant: { id: "tenant_1" },
      role: "admin",
    } satisfies SessionPayload);

    expect(knowledgeActor).toEqual({
      role: "admin",
      tenant: { id: "tenant_1" },
      user: { id: "admin_1" },
    });
  });
});
