import { splitSetCookieHeader } from "better-auth/cookies";

export function extractSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (headers as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }

  const setCookie = headers.get("set-cookie");
  return setCookie === null ? [] : splitSetCookieHeader(setCookie);
}
