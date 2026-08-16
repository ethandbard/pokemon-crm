CREATE TABLE "abilities" (
	"slug" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"effect" text,
	"short_effect" text,
	"generation" integer,
	"is_main_series" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roster" ADD COLUMN "ability" text;--> statement-breakpoint
CREATE INDEX "abilities_generation_idx" ON "abilities" USING btree ("generation");