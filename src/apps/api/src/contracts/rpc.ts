import type { HonoBase } from "hono/hono-base";
import type { Endpoint } from "hono/types";

import type { SessionPayload } from "@kb/auth";
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  EmptyPayload,
} from "@kb/shared";
import type {
  CreateUserInput,
  UpdateUserInput,
  UsersPage,
  UserSummary,
} from "@kb/users";

import type { ApiEnv } from "./context";

type JsonEndpoint<Input, Output, Status extends number> = Endpoint & {
  input: Input;
  output: Output;
  outputFormat: "json";
  status: Status;
};

// Hono RPC schema must stay a type alias so literal route keys are preserved.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type ApiRouteSchema = {
  "/api/auth/login": {
    $post: JsonEndpoint<
      { json: { email: string; password: string } },
      ApiSuccessResponse<SessionPayload> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 429 | 500
    >;
  };
  "/api/auth/logout": {
    $post: JsonEndpoint<
      Record<string, never>,
      ApiSuccessResponse<EmptyPayload> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 429 | 500
    >;
  };
  "/api/auth/session": {
    $get: JsonEndpoint<
      Record<string, never>,
      ApiSuccessResponse<SessionPayload> | ApiErrorResponse,
      200 | 401 | 403 | 429 | 500
    >;
  };
  "/api/users": {
    $get: JsonEndpoint<
      {
        query?: {
          filter?: string;
          page?: string;
          pageSize?: string;
          search?: string;
          sort?: string;
        };
      },
      ApiSuccessResponse<UsersPage> | ApiErrorResponse,
      200 | 401 | 403 | 429 | 500
    >;
    $post: JsonEndpoint<
      { json: CreateUserInput },
      ApiSuccessResponse<UserSummary> | ApiErrorResponse,
      201 | 400 | 401 | 403 | 409 | 429 | 500
    >;
  };
  "/api/users/:userId": {
    $get: JsonEndpoint<
      { param: { userId: string } },
      ApiSuccessResponse<UserSummary> | ApiErrorResponse,
      200 | 401 | 403 | 404 | 429 | 500
    >;
    $patch: JsonEndpoint<
      { json: UpdateUserInput; param: { userId: string } },
      ApiSuccessResponse<UserSummary> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 404 | 409 | 429 | 500
    >;
  };
  "/api/users/:userId/access": {
    $delete: JsonEndpoint<
      { param: { userId: string } },
      ApiSuccessResponse<EmptyPayload> | ApiErrorResponse,
      200 | 400 | 401 | 403 | 404 | 429 | 500
    >;
  };
};

export type ApiApp = HonoBase<ApiEnv, ApiRouteSchema, "/">;
