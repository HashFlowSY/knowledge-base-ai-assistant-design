import { describe, expect, it } from "vitest";

import { providerErrorCodeSchema, providerKindSchema } from "./index";

describe("@kb/ai-providers", () => {
  it("defines provider kinds for the initial architecture", () => {
    expect(providerKindSchema.parse("deepseek")).toBe("deepseek");
  });

  it("defines normalized provider error codes", () => {
    expect(providerErrorCodeSchema.parse("PROVIDER_TIMEOUT")).toBe("PROVIDER_TIMEOUT");
  });
});
