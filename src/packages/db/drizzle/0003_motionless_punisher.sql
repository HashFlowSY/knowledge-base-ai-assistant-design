CREATE UNIQUE INDEX "answer_citations_tenant_id_id_idx" ON "answer_citations" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "answer_feedback_citations" ADD CONSTRAINT "answer_feedback_citations_tenant_citation_fk" FOREIGN KEY ("tenant_id","citation_id") REFERENCES "public"."answer_citations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
