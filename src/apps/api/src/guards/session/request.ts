import type { Context } from "hono";

import type { ApiEnv } from "../../contracts";

export function getRequestIpSummary(context: Context<ApiEnv>): string {
  const forwardedFor = context.req.header("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return firstForwardedIp && firstForwardedIp.length > 0
    ? firstForwardedIp
    : "127.0.0.1";
}
