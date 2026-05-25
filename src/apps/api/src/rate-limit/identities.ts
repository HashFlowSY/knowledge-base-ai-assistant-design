import { getSessionCookieValue, normalizeEmail } from "@kb/auth";
import { sha256Hex } from "@kb/security";

import type { RateLimitIdentityInput } from "./types";

export async function createRateLimitIdentity(
  input: RateLimitIdentityInput,
): Promise<string> {
  if (input.kind === "actor") {
    return `tenant:${input.tenantId}:actor:${input.actorId}`;
  }

  if (input.kind === "ip") {
    return `ip:${await sha256Hex(input.ipSummary)}`;
  }

  if (input.kind === "session") {
    if (
      input.sessionCookie !== undefined &&
      input.sessionCookie !== null &&
      input.sessionCookie.length > 0
    ) {
      return `session:${await sha256Hex(input.sessionCookie)}`;
    }

    return `ip:${await sha256Hex(input.ipSummary)}`;
  }

  const ipHash = await sha256Hex(input.ipSummary);
  const trimmedEmail = input.email?.trim() ?? "";
  if (trimmedEmail.length === 0 || !trimmedEmail.includes("@")) {
    return `ip:${ipHash}`;
  }

  return `ip:${ipHash}:email:${await sha256Hex(normalizeEmail(trimmedEmail))}`;
}

export async function createSessionRateLimitIdentity(input: {
  cookieHeader: string | null | undefined;
  ipSummary: string;
}): Promise<string> {
  return createRateLimitIdentity({
    kind: "session",
    ipSummary: input.ipSummary,
    sessionCookie: getSessionCookieValue(input.cookieHeader),
  });
}
