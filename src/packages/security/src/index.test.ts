import { describe, expect, it } from "vitest";

import { maskSecret, secretReferenceSchema } from "./index";

describe("@kb/security", () => {
  it("masks secret values without exposing the full input", () => {
    expect(maskSecret("deepseek-api-key")).toBe("[REDACTED]-key");
  });

  it("normalizes secret references", () => {
    expect(secretReferenceSchema.parse({ secretId: "secret_1" })).toEqual({
      secretId: "secret_1",
      version: "v1",
    });
  });
});
