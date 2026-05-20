import { normalizeEmail } from "@kb/auth";
import { hashPasswordForAccount } from "@kb/auth/server";

import {
  defaultDevAuthUsers,
  type DevAuthSeedRepository,
} from "./seed-dev-auth-contracts";
import { shouldLoadExampleEnv } from "./index";

export function shouldRunDevAuthSeed(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production";
}

export async function seedDevAuth(input: {
  nodeEnv: string | undefined;
  repository?: DevAuthSeedRepository;
}): Promise<{
  seeded: boolean;
  message: string;
}> {
  if (!shouldRunDevAuthSeed(input.nodeEnv)) {
    return {
      seeded: false,
      message: "Refusing to seed default auth users in production.",
    };
  }

  if (input.repository !== undefined) {
    const defaultTenant = await input.repository.ensureDefaultTenant({
      name: "Default Tenant",
      slug: "default",
    });

    for (const user of defaultDevAuthUsers) {
      const email = normalizeEmail(user.email);
      const upsertedUser = await input.repository.upsertUser({
        email,
        name: user.name,
      });
      const passwordHash = await hashPasswordForAccount(user.password);

      await input.repository.upsertPasswordAccount({
        email,
        passwordHash,
        providerId: "credential",
        userId: upsertedUser.userId,
      });
      await input.repository.upsertMembership({
        email,
        isActive: true,
        role: user.role,
        tenantId: defaultTenant.tenantId,
        userId: upsertedUser.userId,
      });
    }

    return {
      seeded: true,
      message: "Dev auth seed created or repaired default tenant and users.",
    };
  }

  return {
    seeded: true,
    message: shouldLoadExampleEnv(input.nodeEnv)
      ? "Dev auth seed is ready for local infrastructure."
      : "Dev auth seed is ready.",
  };
}
