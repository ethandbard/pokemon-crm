CREATE TABLE "move_machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"move_id" integer NOT NULL,
	"version_group" text NOT NULL,
	"version_group_order" integer,
	"tm_number" text NOT NULL,
	"item_slug" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "move_machines" ADD CONSTRAINT "move_machines_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "move_machines_move_version_idx" ON "move_machines" USING btree ("move_id","version_group");--> statement-breakpoint
CREATE INDEX "move_machines_move_idx" ON "move_machines" USING btree ("move_id");