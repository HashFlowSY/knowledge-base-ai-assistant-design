import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";

import type { ApiEnv } from "../contracts";
import { readJsonBody, respondWithValidationError } from "../http";

export function createJsonBodyValidationMiddleware<T>(
  key: string,
  schema: z.ZodType<T>,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const body = await readJsonBodyOnce(context);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return respondWithValidationError(context, parsed.error);
    }

    setValidatedInput(context, key, parsed.data);
    return next();
  };
}

export function createQueryValidationMiddleware<T>(
  key: string,
  schema: z.ZodType<T>,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const query = Object.fromEntries(new URL(context.req.url).searchParams);
    const parsed = schema.safeParse(query);
    if (!parsed.success) {
      return respondWithValidationError(context, parsed.error);
    }

    setValidatedInput(context, key, parsed.data);
    return next();
  };
}

export function createParamValidationMiddleware<T>(
  key: string,
  schema: z.ZodType<T>,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const parsed = schema.safeParse(context.req.param());
    if (!parsed.success) {
      return respondWithValidationError(context, parsed.error);
    }

    setValidatedInput(context, key, parsed.data);
    return next();
  };
}

export async function readJsonBodyOnce(
  context: Context<ApiEnv>,
): Promise<unknown> {
  if (context.get("jsonBodyRead")) {
    return context.get("jsonBody");
  }

  const body = await readJsonBody(context.req.raw);
  context.set("jsonBody", body);
  context.set("jsonBodyRead", true);
  return body;
}

export function getValidatedInput<T>(
  context: Context<ApiEnv>,
  key: string,
): T {
  const inputs = context.get("validatedInputs");
  if (!Object.hasOwn(inputs, key)) {
    throw new Error(`Missing validated input: ${key}`);
  }

  return inputs[key] as T;
}

function setValidatedInput<T>(
  context: Context<ApiEnv>,
  key: string,
  value: T,
): void {
  context.set("validatedInputs", {
    ...context.get("validatedInputs"),
    [key]: value,
  });
}
