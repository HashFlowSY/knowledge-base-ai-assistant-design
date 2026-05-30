export type WorkspaceDialogState =
  | { mode: "create" }
  | { knowledgeBaseId: string; mode: "edit" }
  | { knowledgeBaseId: string; mode: "upload" }
  | null;

export interface MemberOption {
  email: string;
  id: string;
  name: string;
}
