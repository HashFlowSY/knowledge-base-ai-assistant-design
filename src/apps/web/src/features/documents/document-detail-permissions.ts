import type { MockRole } from "../mock/types";

export function canShowDocumentProcessingLogLink(role: MockRole | null): boolean {
  return role === "admin";
}
