import { describe, expect, it } from "vitest";

import { userSummarySchema } from "./index";

describe("@kb/users", () => {
  it("uses the shared fixed role contract", () => {
    expect(
      userSummarySchema.parse({
        userId: "user_1",
        tenantId: "tenant_1",
        email: "admin@example.com",
        name: "管理员",
        role: "admin",
      }).role,
    ).toBe("admin");
  });
});
