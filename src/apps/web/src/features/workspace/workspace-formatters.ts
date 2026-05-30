import type {
  KnowledgeBaseMemberSummary,
  KnowledgeBaseSummary,
} from "@kb/knowledge";
import type { UserSummary } from "@kb/users";

import { knowledgeCopy } from "../../copy/knowledge";
import { ApiClientError } from "../api/client";
import type { MemberOption } from "./workspace-types";

export function formatMemberSummary(
  members: KnowledgeBaseMemberSummary[],
  memberCount: number,
): string {
  if (memberCount === 0) {
    return knowledgeCopy.members.empty;
  }

  const names = members.slice(0, 2).map((member) => member.name);
  if (memberCount <= names.length) {
    return names.join("、");
  }

  return `${names.join("、")}等 ${memberCount} 人`;
}

export function dedupeKnowledgeBases(
  items: KnowledgeBaseSummary[],
): KnowledgeBaseSummary[] {
  const byId = new Map<string, KnowledgeBaseSummary>();

  for (const item of items) {
    byId.set(item.id, item);
  }

  return Array.from(byId.values());
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function toMemberOption(
  member: KnowledgeBaseMemberSummary | UserSummary,
): MemberOption {
  return {
    email: member.email,
    id: member.id,
    name: member.name,
  };
}

export function toKnowledgeBaseErrorCopy(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.response.code === "CONFLICT" || error.response.httpStatus === 409) {
      return knowledgeCopy.errors.duplicateKnowledgeBase;
    }

    return error.response.message;
  }

  return knowledgeCopy.errors.saveKnowledgeBase;
}
