# Better Auth + Drizzle Notes

## Sources

* Better Auth official docs: `https://better-auth.com/docs/adapters/drizzle`
* Better Auth official docs: `https://better-auth.com/docs/concepts/database`

## Findings

* Better Auth supports Drizzle as a database adapter.
* For ORM usage, Better Auth expects schema migrations to be handled by the ORM migration workflow rather than by Better Auth CLI migrations.
* The required core auth tables are `user`, `session`, `account`, and `verification`.
* Better Auth permits table and field customization, including custom table names and mapped fields.
* The database task should include Better Auth-compatible core tables in the initial Drizzle schema so the later authentication task does not need to introduce a separate foundational migration.

## Design Implication

Use Better Auth-compatible auth tables in the initial schema and keep business tenancy/membership data separate:

* Auth identity: Better Auth tables.
* Product authorization: tenant memberships, roles, knowledge base membership, and audit ownership.
* Use stable foreign keys from business tables to the auth user id where possible.

