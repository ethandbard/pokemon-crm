CREATE TABLE "growth_rates" (
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"experience" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "growth_rate" text;--> statement-breakpoint
CREATE UNIQUE INDEX "growth_rates_name_level_idx" ON "growth_rates" USING btree ("name","level");