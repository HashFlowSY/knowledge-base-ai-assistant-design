ALTER TABLE "provider_configs" ADD COLUMN "base_url" varchar(500);--> statement-breakpoint
UPDATE "provider_configs"
SET "base_url" = COALESCE(NULLIF("settings"->>'baseUrl', ''), NULLIF("settings"->>'base_url', ''), '')
WHERE "base_url" IS NULL;--> statement-breakpoint
ALTER TABLE "provider_configs" ALTER COLUMN "base_url" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_configs_tenant_kind_idx" ON "provider_configs" USING btree ("tenant_id","kind");
