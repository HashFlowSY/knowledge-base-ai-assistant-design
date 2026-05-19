import type { SessionPayload } from "@kb/auth";

export function getLoginRedirectTarget({
  isLoading,
  redirectTo,
  session,
}: {
  isLoading: boolean;
  redirectTo: string;
  session: SessionPayload | null | undefined;
}): string | null {
  if (isLoading || session === null || session === undefined) {
    return null;
  }

  return redirectTo;
}

export function isInternalRedirect(value: string | null): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

export function sanitizeRedirectTo(value: string | null): string {
  if (!isInternalRedirect(value) || value === "/login" || value.startsWith("/login/")) {
    return "/workspace";
  }

  return value;
}
