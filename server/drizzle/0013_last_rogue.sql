CREATE TABLE "items" (
	"slug" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"category" text,
	"effect" text,
	"short_effect" text,
	"sprite_url" text,
	"fling_power" integer
);
--> statement-breakpoint
CREATE TABLE "roster_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"roster_id" integer NOT NULL,
	"item_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_items_roster_id_unique" UNIQUE("roster_id")
);
--> statement-breakpoint
ALTER TABLE "roster_items" ADD CONSTRAINT "roster_items_roster_id_roster_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."roster"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "roster_items_item_idx" ON "roster_items" USING btree ("item_slug");