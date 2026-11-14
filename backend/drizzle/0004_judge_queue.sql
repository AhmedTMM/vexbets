ALTER TABLE "markets" ADD COLUMN "judging_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "judge_pending" boolean DEFAULT false NOT NULL;