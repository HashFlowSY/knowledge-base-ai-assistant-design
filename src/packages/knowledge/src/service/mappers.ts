import type {
  KnowledgeBaseDetail,
  KnowledgeBaseMemberSummary,
  KnowledgeBaseSummary,
} from "../contracts/schemas";

export interface KnowledgeBaseRow {
  createdAt: Date;
  description: string | null;
  id: string;
  name: string;
  updatedAt: Date;
}

export interface KnowledgeBaseMemberRow {
  email: string;
  id: string;
  knowledgeBaseId: string;
  name: string;
}

export function toKnowledgeBaseSummary(
  row: KnowledgeBaseRow,
  input: {
    documentCount: number;
    members: KnowledgeBaseMemberSummary[];
  },
): KnowledgeBaseSummary {
  return {
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    documentCount: input.documentCount,
    id: row.id,
    memberCount: input.members.length,
    members: input.members,
    name: row.name,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const toKnowledgeBaseDetail = toKnowledgeBaseSummary satisfies (
  row: KnowledgeBaseRow,
  input: {
    documentCount: number;
    members: KnowledgeBaseMemberSummary[];
  },
) => KnowledgeBaseDetail;
