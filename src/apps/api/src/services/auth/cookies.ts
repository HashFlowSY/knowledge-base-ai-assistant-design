import {
  extractSetCookieHeaders,
  type BetterAuthRuntime,
} from "@kb/auth/server";

export async function signOutWithSetCookieHeaders(
  runtime: Pick<BetterAuthRuntime, "api">,
  setCookieHeaders: string[],
): Promise<string[]> {
  const cookieHeader = createCookieHeaderFromSetCookieHeaders(setCookieHeaders);
  if (cookieHeader === null) {
    return [];
  }

  const result = await runtime.api.signOut({
    headers: new Headers({ cookie: cookieHeader }),
    returnHeaders: true,
  });

  return extractSetCookieHeaders(result.headers);
}

export async function signOutWithCookieHeader(
  runtime: Pick<BetterAuthRuntime, "api">,
  cookieHeader: string | null,
): Promise<string[]> {
  if (cookieHeader === null) {
    return [];
  }

  const result = await runtime.api.signOut({
    headers: new Headers({ cookie: cookieHeader }),
    returnHeaders: true,
  });

  return extractSetCookieHeaders(result.headers);
}

export function createCookieHeaderFromSetCookieHeaders(
  setCookieHeaders: string[],
): string | null {
  const cookiePairs = setCookieHeaders.flatMap((setCookieHeader) => {
    const cookiePair = setCookieHeader.split(";")[0]?.trim();
    return cookiePair === undefined || cookiePair.length === 0 ? [] : [cookiePair];
  });

  return cookiePairs.length === 0 ? null : cookiePairs.join("; ");
}
