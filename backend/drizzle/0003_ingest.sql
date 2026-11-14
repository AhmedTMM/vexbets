CREATE TABLE "listen_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"band_number" integer NOT NULL,
	"subject_name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"segment_count" integer DEFAULT 0 NOT NULL,
	"head_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"text" text NOT NULL,
	"confidence" real NOT NULL,
	"speaker" text,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listen_sessions" ADD CONSTRAINT "listen_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_session_id_listen_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."listen_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listen_sessions_band_idx" ON "listen_sessions" USING btree ("band_number","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_session_seq_idx" ON "segments" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "segments_time_idx" ON "segments" USING btree ("start_ms");