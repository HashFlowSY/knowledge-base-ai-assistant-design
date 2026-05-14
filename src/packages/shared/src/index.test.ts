import { describe, expect, it } from "vitest";

import { createUtcTimestamp, serviceNameSchema } from "./index";

describe("@kb/shared", () => {
  it("validates canonical service names", () => {
    expect(serviceNameSchema.parse("api")).toBe("api");
  });

  it("creates ISO timestamps in UTC", () => {
    expect(createUtcTimestamp(new Date("2026-05-14T00:00:00.000Z"))).toBe(
      "2026-05-14T00:00:00.000Z",
    );
  });
});
