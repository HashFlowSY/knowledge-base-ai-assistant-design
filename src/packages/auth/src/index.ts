import { z } from "zod";

export const roleSchema = z.enum(["admin", "member"]);

export type Role = z.infer<typeof roleSchema>;

export const authActorSchema = z.object({
  actorId: z.string().min(1),
  tenantId: z.string().min(1),
  role: roleSchema,
});

export type AuthActor = z.infer<typeof authActorSchema>;

export const sessionPayloadSchema = z
  .object({
    user: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      email: z.string().email(),
    }),
    tenant: z.object({
      id: z.string().min(1),
    }),
    role: roleSchema,
  })
  .strict();

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

export const loginInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .transform((value) => normalizeEmail(value)),
    password: z.string().min(1),
  })
  .strict();

export type LoginInput = z.infer<typeof loginInputSchema>;

export const betterAuthSessionCookieName = "better-auth.session_token";

export function isAdmin(actor: AuthActor): boolean {
  return actor.role === "admin";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getSessionCookieValue(
  cookieHeader: string | null | undefined,
): string | null {
  if (
    cookieHeader === null ||
    cookieHeader === undefined ||
    cookieHeader.trim().length === 0
  ) {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    if (rawName !== betterAuthSessionCookieName) {
      continue;
    }

    const rawValue = rawValueParts.join("=");
    if (rawValue.length === 0) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch (error) {
      if (error instanceof URIError) {
        return null;
      }

      throw error;
    }
  }

  return null;
}
