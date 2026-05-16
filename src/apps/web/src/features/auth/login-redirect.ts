import type { RouteAccess } from "../mock/types";

export function getLoginRedirectTarget({
  hydrated,
  routeAccess,
}: {
  hydrated: boolean;
  routeAccess: RouteAccess;
}): string | null {
  if (!hydrated || routeAccess.allowed || routeAccess.reason !== "already_authenticated") {
    return null;
  }

  return routeAccess.redirectTo;
}
