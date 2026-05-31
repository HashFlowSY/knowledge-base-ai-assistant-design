export type AppShellSkeletonVariant = "workspace" | "table" | "chat";

export function shellSkeletonVariantForPath(path: string): AppShellSkeletonVariant {
  if (path.startsWith("/chat")) {
    return "chat";
  }

  if (path.startsWith("/users") || path.startsWith("/providers")) {
    return "table";
  }

  return "workspace";
}
