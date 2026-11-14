CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"question" text NOT NULL,
	"tagline" text NOT NULL,
	"criteria" text NOT NULL,
	"fallback_outcome_id" uuid NOT NULL,
	"resolve_early" boolean NOT NULL,
	"band_number" integer NOT NULL,
	"subject_name" text NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"liquidity_b" integer NOT NULL,
	"status" text NOT NULL,
	"volume_credits" integer DEFAULT 0 NOT NULL,
	"escrow" integer NOT NULL,
	"last_judged_at" timestamp with time zone,
	"resolution" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"label" text NOT NULL,
	"criteria" text,
	"shares" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "markets_status_idx" ON "markets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "markets_band_idx" ON "markets" USING btree ("band_number","status");--> statement-breakpoint
CREATE UNIQUE INDEX "outcomes_market_idx" ON "outcomes" USING btree ("market_id","idx");