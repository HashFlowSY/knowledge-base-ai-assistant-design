export type AppShellSkeletonVariant = "workspace" | "table" | "chat" | "document";

export function shellSkeletonVariantForPath(path: string): AppShellSkeletonVariant {
  const [pathname] = path.split("?");

  if (pathname === "/chat" || pathname?.startsWith("/chat/")) {
    return "chat";
  }

  if (pathname?.startsWith("/documents/")) {
    return "document";
  }

  if (
    pathname === "/documents" ||
    pathname === "/tasks" ||
    pathname === "/logs" ||
    pathname === "/providers" ||
    pathname === "/users" ||
    pathname === "/audit" ||
    pathname?.startsWith("/tasks/") ||
    pathname?.startsWith("/logs/") ||
    pathname?.startsWith("/providers/") ||
    pathname?.startsWith("/users/") ||
    pathname?.startsWith("/audit/")
  ) {
    return "table";
  }

  return "workspace";
}
