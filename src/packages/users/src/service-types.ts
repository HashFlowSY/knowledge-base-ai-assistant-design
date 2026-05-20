import type { SessionPayload } from "@kb/auth";
import type { ProjectDb } from "@kb/db";

import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  UserSummary,
  UsersPage,
} from "./schemas";
import type { UserRequestContextGetter } from "./service-audit";
import type { UserServiceError } from "./service-errors";

export interface UserManagementServiceOptions {
  db: ProjectDb;
  getRequestContext?: UserRequestContextGetter;
}

export interface UserManagementService {
  listUsers(input: {
    actor: SessionPayload;
    query: ListUsersQuery;
  }): Promise<{ ok: true; page: UsersPage } | UserServiceError>;
  createUser(input: {
    actor: SessionPayload;
    body: CreateUserInput;
  }): Promise<{ ok: true; user: UserSummary } | UserServiceError>;
  getUser(input: {
    actor: SessionPayload;
    userId: string;
  }): Promise<{ ok: true; user: UserSummary } | UserServiceError>;
  updateUser(input: {
    actor: SessionPayload;
    body: UpdateUserInput;
    userId: string;
  }): Promise<{ ok: true; user: UserSummary } | UserServiceError>;
  removeUserAccess(input: {
    actor: SessionPayload;
    userId: string;
  }): Promise<{ ok: true } | UserServiceError>;
}
