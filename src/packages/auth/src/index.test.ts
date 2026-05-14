import { describe, expect, it } from "vitest";

import { authActorSchema, isAdmin } from "./index";

describe("@kb/auth", () => {
  it("identifies admin actors", () => {
    const actor = authActorSchema.parse({
      actorId: "user_1",
      tenantId: "tenant_1",
      role: "admin",
    });

    expect(isAdmin(actor)).toBe(true);
  });
});
