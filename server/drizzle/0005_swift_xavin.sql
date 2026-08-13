CREATE TYPE "public"."move_damage_class" AS ENUM('physical', 'special', 'status');--> statement-breakpoint
CREATE TABLE "moves" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"type" text NOT NULL,
	"damage_class" "move_damage_class" NOT NULL,
	"generation" integer,
	"power" integer,
	"accuracy" integer,
	"pp" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"effect" text,
	"effect_chance" integer,
	"flavor_text" text,
	"ailment" text,
	"ailment_chance" integer,
	"crit_rate" integer,
	"drain" integer,
	"healing" integer,
	"target" text,
	"learned_by_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokemon_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"pokemon_id" integer NOT NULL,
	"move_id" integer NOT NULL,
	"learn_method" text NOT NULL,
	"level_learned_at" integer DEFAULT 0 NOT NULL,
	"version_group" text
);
--> statement-breakpoint
ALTER TABLE "pokemon_moves" ADD CONSTRAINT "pokemon_moves_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokemon_moves" ADD CONSTRAINT "pokemon_moves_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moves_name_idx" ON "moves" USING btree ("name");--> statement-breakpoint
CREATE INDEX "moves_type_idx" ON "moves" USING btree ("type");--> statement-breakpoint
CREATE INDEX "moves_damage_class_idx" ON "moves" USING btree ("damage_class");--> statement-breakpoint
CREATE INDEX "moves_power_idx" ON "moves" USING btree ("power");--> statement-breakpoint
CREATE INDEX "moves_learned_by_count_idx" ON "moves" USING btree ("learned_by_count");--> statement-breakpoint
CREATE UNIQUE INDEX "pokemon_moves_unique_idx" ON "pokemon_moves" USING btree ("pokemon_id","move_id","learn_method");--> statement-breakpoint
CREATE INDEX "pokemon_moves_pokemon_idx" ON "pokemon_moves" USING btree ("pokemon_id");--> statement-breakpoint
CREATE INDEX "pokemon_moves_move_idx" ON "pokemon_moves" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX "pokemon_moves_method_idx" ON "pokemon_moves" USING btree ("learn_method");--> statement-breakpoint
CREATE INDEX "pokemon_moves_pokemon_level_idx" ON "pokemon_moves" USING btree ("pokemon_id","level_learned_at");