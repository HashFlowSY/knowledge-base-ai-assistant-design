ALTER TABLE "auth_accounts" RENAME COLUMN "access_token" TO "encrypted_access_token";--> statement-breakpoint
ALTER TABLE "auth_accounts" RENAME COLUMN "refresh_token" TO "encrypted_refresh_token";--> statement-breakpoint
ALTER TABLE "auth_accounts" RENAME COLUMN "id_token" TO "encrypted_id_token";--> statement-breakpoint
ALTER TABLE "auth_accounts" RENAME COLUMN "password" TO "password_hash";