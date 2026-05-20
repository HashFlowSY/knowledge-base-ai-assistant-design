import type { UpdateUserInput, UserSummary } from "./schemas";

export interface ActiveUserRow {
  createdAt: Date;
  email: string;
  id: string;
  membershipUpdatedAt: Date;
  name: string;
  role: "admin" | "member";
  updatedAt: Date;
}

export function getUpdatedFieldNames(input: UpdateUserInput): string[] {
  const fields: string[] = [];
  if (input.name !== undefined) {
    fields.push("name");
  }
  if (input.email !== undefined) {
    fields.push("email");
  }
  if (input.role !== undefined) {
    fields.push("role");
  }

  return fields;
}

export function toUserSummary(row: ActiveUserRow): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    updatedAt:
      row.updatedAt.getTime() >= row.membershipUpdatedAt.getTime()
        ? row.updatedAt.toISOString()
        : row.membershipUpdatedAt.toISOString(),
  };
}
