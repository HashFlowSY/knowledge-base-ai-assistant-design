import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  apiErrorCodeSchema,
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  createUtcTimestamp,
  emptyPayloadSchema,
  pageResultSchema,
  serviceNameSchema,
} from "./index";

describe("@kb/shared", () => {
  it("validates canonical service names", () => {
    expect(serviceNameSchema.parse("api")).toBe("api");
  });

  it("creates ISO timestamps in UTC", () => {
    expect(createUtcTimestamp(new Date("2026-05-14T00:00:00.000Z"))).toBe(
      "2026-05-14T00:00:00.000Z",
    );
  });

  it("validates the uniform API success envelope", () => {
    expect(
      apiSuccessResponseSchema(z.object({ id: z.string() })).parse({
        success: true,
        httpStatus: 200,
        data: { id: "user_1" },
        requestId: "req_1",
      }),
    ).toEqual({
      success: true,
      httpStatus: 200,
      data: { id: "user_1" },
      requestId: "req_1",
    });
  });

  it("validates the uniform API error envelope", () => {
    expect(
      apiErrorResponseSchema.parse({
        success: false,
        httpStatus: 400,
        code: "VALIDATION_ERROR",
        message: "请检查填写内容。",
        requestId: "req_1",
        validationErrors: [{ path: ["email"], message: "Invalid email" }],
      }),
    ).toMatchObject({
      success: false,
      httpStatus: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects non-standard public API error codes", () => {
    expect(apiErrorCodeSchema.parse("RATE_LIMITED")).toBe("RATE_LIMITED");
    expect(() => apiErrorCodeSchema.parse("DATABASE_FAILED")).toThrow();
    expect(() =>
      apiErrorResponseSchema.parse({
        success: false,
        httpStatus: 500,
        code: "DATABASE_FAILED",
        message: "Internal details",
        requestId: "req_1",
      }),
    ).toThrow();
  });

  it("uses null as the empty success payload", () => {
    expect(emptyPayloadSchema.parse(null)).toBeNull();
    expect(() => emptyPayloadSchema.parse({})).toThrow();
  });

  it("validates page result envelopes without redefining list metadata", () => {
    expect(
      pageResultSchema(z.object({ id: z.string() })).parse({
        items: [{ id: "item_1" }],
        page: 2,
        pageSize: 8,
        total: 13,
      }),
    ).toEqual({
      items: [{ id: "item_1" }],
      page: 2,
      pageSize: 8,
      total: 13,
    });
  });
});
