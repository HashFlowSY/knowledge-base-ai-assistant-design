import type { MockRole } from "../mock/types";

export function canShowWorkspaceProcessingLogs(role: MockRole | null): boolean {
  return role === "admin";
}
