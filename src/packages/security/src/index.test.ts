import { describe, expect, it } from "vitest";

import { sha256Hex, maskSecret, secretReferenceSchema } from "./index";

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

  it("hashes raw identifiers before they enter rate-limit keys", async () => {
    await expect(sha256Hex("admin@example.com")).resolves.toBe(
      "258d8dc916db8cea2cafb6c3cd0cb0246efe061421dbd83ec3a350428cabda4f",
    );
  });
});
