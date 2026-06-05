ALTER TYPE "public"."document_source_object_cleanup_status" ADD VALUE 'cleanup_in_progress' BEFORE 'cleanup_succeeded';--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "object_cleanup_claim_token" varchar(120);--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "object_cleanup_claimed_at" timestamp with time zone;