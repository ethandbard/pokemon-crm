CREATE TABLE "natures" (
	"slug" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"increased_stat" text,
	"decreased_stat" text
);
--> statement-breakpoint
ALTER TABLE "roster" ADD COLUMN "nature" text;