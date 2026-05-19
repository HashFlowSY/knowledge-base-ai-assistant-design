"use client";

import { hc } from "hono/client";

import type { ApiApp } from "@kb/api";
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  type ApiErrorResponse,
  type ApiSuccessResponse,
} from "@kb/shared";

export const apiClient = hc<ApiApp>("/");

export class ApiClientError extends Error {
  readonly response: ApiErrorResponse;

  constructor(response: ApiErrorResponse) {
    super(response.message);
    this.name = "ApiClientError";
    this.response = response;
  }
}

export async function apiRequest<T>(input: {
  dataSchema: Parameters<typeof apiSuccessResponseSchema>[0];
  init?: RequestInit;
  path: string;
}): Promise<ApiSuccessResponse<T>> {
  const response = await fetch(input.path, {
    credentials: "include",
    ...input.init,
  });
  const raw: unknown = await response.json();

  if (!response.ok) {
    throw new ApiClientError(apiErrorResponseSchema.parse(raw));
  }

  return apiSuccessResponseSchema(input.dataSchema).parse(raw) as ApiSuccessResponse<T>;
}

export async function parseApiClientResponse<T>(input: {
  dataSchema: Parameters<typeof apiSuccessResponseSchema>[0];
  response: Response;
}): Promise<ApiSuccessResponse<T>> {
  const raw: unknown = await input.response.json();

  if (!input.response.ok) {
    throw new ApiClientError(apiErrorResponseSchema.parse(raw));
  }

  return apiSuccessResponseSchema(input.dataSchema).parse(raw) as ApiSuccessResponse<T>;
}

export function createBrowserMutationInit(input: {
  body?: unknown;
  method: "DELETE" | "PATCH" | "POST" | "PUT";
}): RequestInit {
  if (input.body === undefined) {
    return {
      method: input.method,
    };
  }

  return {
    body: JSON.stringify(input.body),
    headers: {
      "content-type": "application/json",
    },
    method: input.method,
  };
}
