CREATE TYPE "public"."document_source_object_cleanup_status" AS ENUM('not_required', 'pending_cleanup', 'cleanup_succeeded', 'cleanup_failed');--> statement-breakpoint
CREATE TYPE "public"."document_source_scan_status" AS ENUM('not_scanned', 'pending', 'clean', 'infected', 'scan_failed');--> statement-breakpoint
CREATE TYPE "public"."document_source_upload_status" AS ENUM('pending_upload', 'available', 'upload_failed');--> statement-breakpoint
ALTER TYPE "public"."ingestion_job_status" ADD VALUE 'pending_source' BEFORE 'queued';--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "bucket" varchar(255);--> statement-breakpoint
UPDATE "document_sources"
SET "bucket" = COALESCE(NULLIF("metadata"->>'bucket', ''), 'kb-source')
WHERE "bucket" IS NULL;--> statement-breakpoint
ALTER TABLE "document_sources" ALTER COLUMN "bucket" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "upload_status" "document_source_upload_status" DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "scan_status" "document_source_scan_status" DEFAULT 'not_scanned' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "upload_error_code" varchar(120);--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "upload_error_message" text;--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "object_cleanup_status" "document_source_object_cleanup_status" DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "object_cleanup_error_code" varchar(120);--> statement-breakpoint
ALTER TABLE "document_sources" ADD COLUMN "object_cleanup_error_message" text;--> statement-breakpoint
CREATE UNIQUE INDEX "document_sources_active_source_hash_idx" ON "document_sources" USING btree ("tenant_id","knowledge_base_id","source_type","source_hash") WHERE "upload_status" in ('pending_upload', 'available');
