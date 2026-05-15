import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

import { shouldLoadExampleEnv } from "./src";

config({ path: "../../../.env" });

if (shouldLoadExampleEnv(process.env.NODE_ENV)) {
  config({ path: "../../../.env.example" });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Drizzle migrations.");
}

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  out: "./drizzle",
  schema: "./src/schema/index.ts",
  strict: true,
  verbose: true,
});
