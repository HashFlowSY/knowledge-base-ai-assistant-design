import { describe, expect, it } from "vitest";

import { createApiApp, healthResponseSchema } from "../../app";

describe("health API router", () => {
  it("returns a typed health payload and request id header", async () => {
    const app = createApiApp();
    const response = await app.request("/health", {
      headers: {
        "x-request-id": "req_test",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req_test");
    expect(healthResponseSchema.parse(await response.json())).toMatchObject({
      status: "ok",
      service: "api",
      requestId: "req_test",
    });
  });
});
