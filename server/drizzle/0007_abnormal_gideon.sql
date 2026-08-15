CREATE TABLE "type_damage" (
	"attacking_type" text NOT NULL,
	"defending_type" text NOT NULL,
	"multiplier" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "type_damage_pair_idx" ON "type_damage" USING btree ("attacking_type","defending_type");--> statement-breakpoint
CREATE INDEX "type_damage_defending_idx" ON "type_damage" USING btree ("defending_type");