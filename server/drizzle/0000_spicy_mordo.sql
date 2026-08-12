CREATE TYPE "public"."activity_kind" AS ENUM('caught', 'favorite', 'wishlist', 'flagged', 'reviewed');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"pokemon_id" integer NOT NULL,
	"owner" text NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"pokemon_id" integer NOT NULL,
	"owner" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokemon" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"generation" integer NOT NULL,
	"type1" text NOT NULL,
	"type2" text,
	"hp" integer NOT NULL,
	"attack" integer NOT NULL,
	"defense" integer NOT NULL,
	"special_attack" integer NOT NULL,
	"special_defense" integer NOT NULL,
	"speed" integer NOT NULL,
	"base_stat_total" integer NOT NULL,
	"height" integer NOT NULL,
	"weight" integer NOT NULL,
	"base_experience" integer,
	"capture_rate" integer,
	"abilities" text[] DEFAULT '{}' NOT NULL,
	"color" text,
	"is_legendary" boolean DEFAULT false NOT NULL,
	"is_mythical" boolean DEFAULT false NOT NULL,
	"sprite_url" text,
	"artwork_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_pokemon_owner_kind_idx" ON "activity" USING btree ("pokemon_id","owner","kind");--> statement-breakpoint
CREATE INDEX "activity_kind_idx" ON "activity" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "notes_pokemon_id_idx" ON "notes" USING btree ("pokemon_id");--> statement-breakpoint
CREATE INDEX "notes_owner_idx" ON "notes" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "notes_created_at_idx" ON "notes" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pokemon_name_idx" ON "pokemon" USING btree ("name");--> statement-breakpoint
CREATE INDEX "pokemon_type1_idx" ON "pokemon" USING btree ("type1");--> statement-breakpoint
CREATE INDEX "pokemon_generation_idx" ON "pokemon" USING btree ("generation");--> statement-breakpoint
CREATE INDEX "pokemon_base_stat_total_idx" ON "pokemon" USING btree ("base_stat_total");