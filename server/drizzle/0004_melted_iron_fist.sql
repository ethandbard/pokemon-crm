ALTER TABLE "pokemon" ADD COLUMN "ev_hp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "ev_attack" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "ev_defense" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "ev_special_attack" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "ev_special_defense" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "ev_speed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "ev_yield_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "hidden_ability" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "held_items" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "genus" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "flavor_text" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "flavor_text_version" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "egg_groups" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "habitat" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "shape" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "is_baby" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "gender_rate" integer;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "base_happiness" integer;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "hatch_counter" integer;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "varieties" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "regional_dex_numbers" jsonb;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "shiny_sprite_url" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "shiny_artwork_url" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "home_artwork_url" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "cry_url" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "evolution_condition" text;--> statement-breakpoint
ALTER TABLE "pokemon" ADD COLUMN "evolution_requirements" jsonb;--> statement-breakpoint
CREATE INDEX "pokemon_habitat_idx" ON "pokemon" USING btree ("habitat");--> statement-breakpoint
CREATE INDEX "pokemon_shape_idx" ON "pokemon" USING btree ("shape");--> statement-breakpoint
CREATE INDEX "pokemon_growth_rate_idx" ON "pokemon" USING btree ("growth_rate");