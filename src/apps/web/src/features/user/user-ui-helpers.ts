import type { SelectFieldOption } from "@/components/ui/select";

export function canRemoveUserAccessFromUi(input: {
  currentUserId: string | null | undefined;
  targetUserId: string;
}): boolean {
  return input.currentUserId !== input.targetUserId;
}

export function roleOptionsForUser(input: {
  currentUserId: string | null | undefined;
  targetUserId: string | null | undefined;
}): SelectFieldOption[] {
  if (
    input.currentUserId !== null &&
    input.currentUserId !== undefined &&
    input.currentUserId === input.targetUserId
  ) {
    return [{ label: "admin", value: "admin" }];
  }

  return [
    { label: "member", value: "member" },
    { label: "admin", value: "admin" },
  ];
}

export function shouldLogoutAfterUserUpdate(input: {
  currentUserId: string | null | undefined;
  password: string;
  targetUserId: string | null | undefined;
}): boolean {
  return (
    input.currentUserId !== null &&
    input.currentUserId !== undefined &&
    input.currentUserId === input.targetUserId &&
    input.password.trim().length > 0
  );
}
