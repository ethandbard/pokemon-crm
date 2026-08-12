ALTER TABLE "pokemon" ADD COLUMN "evolution_chain_id" integer;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "evolves_from_id" integer;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "evolution_stage" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "chain_length" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "evolution_min_level" integer;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "evolution_trigger" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "is_fully_evolved" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "pokemon_evolution_chain_idx" ON "pokemon" USING btree ("evolution_chain_id");--> statement-breakpoint
CREATE INDEX "pokemon_evolves_from_idx" ON "pokemon" USING btree ("evolves_from_id");