import { z } from "zod";

export const userDomainErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum([
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "VALIDATION_ERROR",
    "INTERNAL_ERROR",
  ]),
  message: z.string().min(1),
});

export type UserDomainError = z.infer<typeof userDomainErrorSchema>;

export type UserDomainResult = { ok: true } | UserDomainError;

export function createSelfProtectionError(): UserDomainError {
  return {
    ok: false,
    code: "FORBIDDEN",
    message: "不能对当前登录管理员执行此操作。",
  };
}
