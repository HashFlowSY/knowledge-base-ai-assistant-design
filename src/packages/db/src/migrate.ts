import { migrationStatusSchema } from "./index";

const status = migrationStatusSchema.parse({
  status: "not_configured",
  message: "Drizzle migrations will be added with the database schema task.",
});

process.stdout.write(`${JSON.stringify(status)}\n`);
