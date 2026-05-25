import type { Context } from "hono";

import type { ApiEnv } from "../contracts";

export function appendSetCookieHeaders(
  context: Context<ApiEnv>,
  setCookieHeaders: string[] | undefined,
): void {
  for (const setCookie of setCookieHeaders ?? []) {
    context.header("Set-Cookie", setCookie, { append: true });
  }
}
