import { describe, expect, it } from "vitest";

import { createPgDevAuthSeedRepository } from "./seed-dev-auth";

describe("pg dev auth seed repository", () => {
  it("exposes the repository operations required by the idempotent seed", () => {
    const repository = createPgDevAuthSeedRepository({} as never);

    expect(repository.ensureDefaultTenant).toBeTypeOf("function");
    expect(repository.upsertUser).toBeTypeOf("function");
    expect(repository.upsertPasswordAccount).toBeTypeOf("function");
    expect(repository.upsertMembership).toBeTypeOf("function");
  });
});
