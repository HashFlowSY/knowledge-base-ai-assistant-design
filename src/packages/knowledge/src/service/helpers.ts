import { randomUUID } from "node:crypto";

import type { KnowledgeBaseMemberSummary } from "../contracts/schemas";
import type { KnowledgeBaseMemberRow, KnowledgeBaseRow } from "./mappers";

export function createKnowledgeBaseSlug(name: string): string {
  const base = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${base.length > 0 ? base : "knowledge-base"}-${randomUUID().slice(0, 8)}`;
}

export function groupMembersByKnowledgeBaseId(
  rows: KnowledgeBaseMemberRow[],
): Map<string, KnowledgeBaseMemberSummary[]> {
  const groups = new Map<string, KnowledgeBaseMemberSummary[]>();

  for (const row of rows) {
    const members = groups.get(row.knowledgeBaseId) ?? [];
    members.push({
      email: row.email,
      id: row.id,
      name: row.name,
    });
    groups.set(row.knowledgeBaseId, members);
  }

  return groups;
}

export function getKnowledgeBaseIds(rows: KnowledgeBaseRow[]): string[] {
  return rows.map((row) => row.id);
}
