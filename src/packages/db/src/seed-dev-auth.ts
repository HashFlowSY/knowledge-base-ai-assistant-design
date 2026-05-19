import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";

import { hashPasswordForAccount, normalizeEmail, type Role } from "@kb/auth";
import {
  authAccounts,
  authUsers,
  createPostgresJsDatabase,
  databaseConfigSchema,
  tenantMemberships,
  tenants,
  type ProjectDb,
} from "./index";

import { shouldLoadExampleEnv } from "./index";

export interface DevAuthSeedRepository {
  ensureDefaultTenant(input: { name: string; slug: string }): Promise<{ tenantId: string }>;
  upsertUser(input: { email: string; name: string }): Promise<{ userId: string }>;
  upsertMembership(input: {
    email: string;
    isActive: true;
    role: Role;
    tenantId: string;
    userId: string;
  }): Promise<void>;
  upsertPasswordAccount(input: {
    email: string;
    passwordHash: string;
    providerId: "credential";
    userId: string;
  }): Promise<void>;
}

export const defaultDevAuthUsers = [
  {
    email: "admin@example.com",
    name: "管理员",
    password: "password123",
    role: "admin" as const,
  },
  {
    email: "member@example.com",
    name: "成员",
    password: "password123",
    role: "member" as const,
  },
];

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

export async function seedDevAuthFromEnvironment(
  env: NodeJS.ProcessEnv,
): Promise<{
  seeded: boolean;
  message: string;
}> {
  if (!shouldRunDevAuthSeed(env.NODE_ENV)) {
    return seedDevAuth({ nodeEnv: env.NODE_ENV });
  }

  const config = databaseConfigSchema.parse({
    databaseUrl: env.DATABASE_URL,
  });
  const runtime = createPostgresJsDatabase(config);

  try {
    return await seedDevAuth({
      nodeEnv: env.NODE_ENV,
      repository: createPgDevAuthSeedRepository(runtime.db),
    });
  } finally {
    await runtime.pool.end();
  }
}

export function createPgDevAuthSeedRepository(db: ProjectDb): DevAuthSeedRepository {
  return {
    async ensureDefaultTenant(input) {
      const existing = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.isDefault, true))
        .limit(1);

      if (existing[0] !== undefined) {
        await db
          .update(tenants)
          .set({
            name: input.name,
            slug: input.slug,
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, existing[0].id));
        return { tenantId: existing[0].id };
      }

      const inserted = await db
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          isDefault: true,
        })
        .returning({ id: tenants.id });

      return { tenantId: inserted[0]?.id ?? "" };
    },
    async upsertUser(input) {
      const now = new Date();
      const existing = await db
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(sql`lower(${authUsers.email}) = ${input.email}`)
        .limit(1);

      if (existing[0] !== undefined) {
        await db
          .update(authUsers)
          .set({
            email: input.email,
            name: input.name,
            updatedAt: now,
          })
          .where(eq(authUsers.id, existing[0].id));
        return { userId: existing[0].id };
      }

      const userId = crypto.randomUUID();
      await db.insert(authUsers).values({
        id: userId,
        email: input.email,
        name: input.name,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });

      return { userId };
    },
    async upsertPasswordAccount(input) {
      const now = new Date();
      await db
        .insert(authAccounts)
        .values({
          id: `credential:${input.userId}`,
          accountId: input.userId,
          providerId: input.providerId,
          userId: input.userId,
          passwordHash: input.passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [authAccounts.providerId, authAccounts.accountId],
          set: {
            passwordHash: input.passwordHash,
            updatedAt: now,
          },
        });
    },
    async upsertMembership(input) {
      const now = new Date();
      await db
        .insert(tenantMemberships)
        .values({
          tenantId: input.tenantId,
          userId: input.userId,
          role: input.role,
          isActive: input.isActive,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [tenantMemberships.tenantId, tenantMemberships.userId],
          set: {
            role: input.role,
            isActive: input.isActive,
            updatedAt: now,
          },
        });
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../..",
  );

  loadEnv({ path: path.join(repoRoot, ".env") });

  if (shouldLoadExampleEnv(process.env.NODE_ENV)) {
    loadEnv({ path: path.join(repoRoot, ".env.example") });
  }

  const result = await seedDevAuthFromEnvironment(process.env);
  if (!result.seeded) {
    throw new Error(result.message);
  }

  process.stdout.write(`${result.message}\n`);
}
