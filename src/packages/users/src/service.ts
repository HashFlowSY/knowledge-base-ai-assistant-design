import { createUserOperation } from "./operations/create-user";
import { getUserOperation } from "./operations/get-user";
import { listUsersOperation } from "./operations/list-users";
import { removeUserAccessOperation } from "./operations/remove-user-access";
import { updateUserOperation } from "./operations/update-user";
import type {
  UserManagementService,
  UserManagementServiceOptions,
} from "./service-types";

export { resolveDefaultTenant, resolveSessionPayload } from "./session-resolution";
export type { UserServiceError } from "./service-errors";
export type {
  UserManagementService,
  UserManagementServiceOptions,
} from "./service-types";

export function createUserManagementService(
  options: UserManagementServiceOptions,
): UserManagementService {
  return {
    listUsers: (input) => listUsersOperation(options, input),
    createUser: (input) => createUserOperation(options, input),
    getUser: (input) => getUserOperation(options, input),
    updateUser: (input) => updateUserOperation(options, input),
    removeUserAccess: (input) => removeUserAccessOperation(options, input),
  };
}
