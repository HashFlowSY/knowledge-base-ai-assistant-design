import { z } from "zod";

export {
  createUserInputSchema,
  listUsersQuerySchema,
  updateUserInputSchema,
  userSummarySchema,
  usersPageSchema,
} from "@kb/users";
export type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  UserSummary,
  UsersPage,
} from "@kb/users";

export const userPathParamsSchema = z
  .object({
    userId: z.string().min(1).regex(/^[A-Za-z0-9._-]+$/),
  })
  .strict();

export type UserPathParams = z.infer<typeof userPathParamsSchema>;
