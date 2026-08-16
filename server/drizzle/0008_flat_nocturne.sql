CREATE TABLE "roster_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"roster_id" integer NOT NULL,
	"move_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roster_moves" ADD CONSTRAINT "roster_moves_roster_id_roster_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."roster"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_moves" ADD CONSTRAINT "roster_moves_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roster_moves_slot_idx" ON "roster_moves" USING btree ("roster_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_moves_unique_idx" ON "roster_moves" USING btree ("roster_id","move_id");--> statement-breakpoint
CREATE INDEX "roster_moves_roster_idx" ON "roster_moves" USING btree ("roster_id");--> statement-breakpoint
CREATE INDEX "roster_moves_move_idx" ON "roster_moves" USING btree ("move_id");