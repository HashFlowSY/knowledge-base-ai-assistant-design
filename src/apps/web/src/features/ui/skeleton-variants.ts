export type AppShellSkeletonVariant = "workspace" | "table" | "chat";

export function shellSkeletonVariantForPath(path: string): AppShellSkeletonVariant {
  const [pathname] = path.split("?");

  if (pathname === "/chat" || pathname?.startsWith("/chat/")) {
    return "chat";
  }

  if (
    pathname === "/providers" ||
    pathname === "/users" ||
    pathname === "/audit" ||
    pathname?.startsWith("/providers/") ||
    pathname?.startsWith("/users/") ||
    pathname?.startsWith("/audit/")
  ) {
    return "table";
  }

  return "workspace";
}
