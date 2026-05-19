import type { SessionPayload } from "@kb/auth";

import { commonCopy } from "../../copy/common";
import { ApiClientError } from "../api/client";

const ADMIN_ROUTES = ["/logs", "/providers", "/users", "/audit"] as const;

export type AppShellSessionGateDecision =
  | { kind: "loading" }
  | { kind: "render" }
  | { kind: "redirect"; href: string }
  | { kind: "clear-session-and-redirect"; href: string }
  | { kind: "error"; message: string };

export function getAppShellSessionGateDecision(input: {
  error: unknown;
  isLoading: boolean;
  pathname: string;
  session: SessionPayload | null | undefined;
}): AppShellSessionGateDecision {
  if (input.isLoading) {
    return { kind: "loading" };
  }

  if (input.error instanceof ApiClientError) {
    if (input.error.response.code === "UNAUTHORIZED") {
      return {
        kind: "redirect",
        href: `/login?redirectTo=${encodeURIComponent(input.pathname)}`,
      };
    }

    if (input.error.response.code === "FORBIDDEN") {
      return {
        kind: "clear-session-and-redirect",
        href: "/login",
      };
    }

    return {
      kind: "error",
      message: input.error.response.message,
    };
  }

  if (input.error !== null && input.error !== undefined) {
    return {
      kind: "error",
      message: commonCopy.states.error,
    };
  }

  if (input.session === null || input.session === undefined) {
    return {
      kind: "redirect",
      href: `/login?redirectTo=${encodeURIComponent(input.pathname)}`,
    };
  }

  if (isAdminRoute(input.pathname) && input.session.role !== "admin") {
    return {
      kind: "redirect",
      href: "/unauthorized",
    };
  }

  return { kind: "render" };
}

export function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
