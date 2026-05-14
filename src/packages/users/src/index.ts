import { z } from "zod";

import { roleSchema } from "@kb/auth";

export const userSummarySchema = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: roleSchema,
});

export type UserSummary = z.infer<typeof userSummarySchema>;
