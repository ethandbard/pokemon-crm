CREATE TYPE "public"."roster_status" AS ENUM('starter', 'active', 'reserve', 'retired');--> statement-breakpoint
CREATE TABLE "roster" (
	"id" serial PRIMARY KEY NOT NULL,
	"trainer_id" integer NOT NULL,
	"pokemon_id" integer NOT NULL,
	"nickname" text,
	"level" integer,
	"status" "roster_status" DEFAULT 'active' NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"specialty" text,
	"email" text,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roster" ADD CONSTRAINT "roster_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster" ADD CONSTRAINT "roster_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roster_trainer_pokemon_idx" ON "roster" USING btree ("trainer_id","pokemon_id");--> statement-breakpoint
CREATE INDEX "roster_trainer_idx" ON "roster" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "roster_pokemon_idx" ON "roster" USING btree ("pokemon_id");--> statement-breakpoint
CREATE INDEX "roster_status_idx" ON "roster" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "trainers_name_idx" ON "trainers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "trainers_region_idx" ON "trainers" USING btree ("region");