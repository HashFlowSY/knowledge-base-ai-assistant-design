import { z } from "zod";

export const roleSchema = z.enum(["admin", "member"]);

export type Role = z.infer<typeof roleSchema>;

export const authActorSchema = z.object({
  actorId: z.string().min(1),
  tenantId: z.string().min(1),
  role: roleSchema,
});

export type AuthActor = z.infer<typeof authActorSchema>;

export function isAdmin(actor: AuthActor): boolean {
  return actor.role === "admin";
}
