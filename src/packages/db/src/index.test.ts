import { describe, expect, it } from "vitest";

import { databaseConfigSchema } from "./index";

describe("@kb/db", () => {
  it("validates database configuration", () => {
    expect(
      databaseConfigSchema.parse({
        databaseUrl: "postgres://kb:kb@localhost:5432/kb",
      }),
    ).toMatchObject({
      poolSize: 10,
    });
  });
});
