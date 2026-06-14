import { describe, expect, it } from "vitest";

import { resolveTrustedClientIpSummary } from "./request";

describe("trusted client IP summary", () => {
  it("uses an explicit fallback when server connection metadata is missing", () => {
    expect(resolveTrustedClientIpSummary({ remoteAddress: null })).toBe("unknown");
    expect(resolveTrustedClientIpSummary({ remoteAddress: undefined })).toBe(
      "unknown",
    );
    expect(resolveTrustedClientIpSummary({ remoteAddress: "   " })).toBe(
      "unknown",
    );
  });

  it("normalizes server remote addresses before they are used as IP summaries", () => {
    expect(resolveTrustedClientIpSummary({ remoteAddress: " 203.0.113.10 " })).toBe(
      "203.0.113.10",
    );
    expect(
      resolveTrustedClientIpSummary({ remoteAddress: "::FFFF:203.0.113.10" }),
    ).toBe("203.0.113.10");
    expect(
      resolveTrustedClientIpSummary({ remoteAddress: "2001:DB8::ABCD" }),
    ).toBe("2001:db8::abcd");
  });
});
