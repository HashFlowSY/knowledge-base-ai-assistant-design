import { describe, expect, it } from "vitest";

import { apiClient, createBrowserMutationInit } from "./client";

describe("API client helpers", () => {
  it("exposes the project Hono RPC client for auth and user APIs", () => {
    expect(apiClient.api.auth.session.$get).toBeTypeOf("function");
    expect(apiClient.api.auth.login.$post).toBeTypeOf("function");
    expect(apiClient.api.users.$get).toBeTypeOf("function");
  });

  it("omits body and content-type for no-body browser mutations", () => {
    expect(createBrowserMutationInit({ method: "DELETE" })).toEqual({
      method: "DELETE",
    });
  });

  it("uses JSON content type only when a mutation body is provided", () => {
    expect(
      createBrowserMutationInit({
        body: { email: "admin@example.com" },
        method: "POST",
      }),
    ).toEqual({
      body: JSON.stringify({ email: "admin@example.com" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  });
});
