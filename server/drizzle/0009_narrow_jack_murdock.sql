ALTER TABLE "trainers" ADD COLUMN "owner" text DEFAULT 'demo@pokemon-crm.local' NOT NULL;--> statement-breakpoint
CREATE INDEX "trainers_owner_idx" ON "trainers" USING btree ("owner");