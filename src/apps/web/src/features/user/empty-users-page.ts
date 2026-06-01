import type { UsersPage } from "@kb/users";

export function emptyUsersPage(page: number, pageSize: number): UsersPage {
  return {
    items: [],
    page,
    pageSize,
    total: 0,
  };
}
