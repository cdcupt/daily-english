CREATE TABLE IF NOT EXISTS "topic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_topic" text NOT NULL,
	"raw_topic" text NOT NULL,
	"cefr_band" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"moderation_status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_sessions_status_check" CHECK ("topic_sessions"."status" IN ('generating', 'ready', 'failed')),
	CONSTRAINT "topic_sessions_moderation_check" CHECK ("topic_sessions"."moderation_status" IN ('pending', 'allowed', 'blocked'))
);
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "topic_kind" text;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "topic_category" text;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "topic_session_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "topic_label" text;--> statement-breakpoint
ALTER TABLE "question_items" ADD COLUMN "topic_session_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topic_sessions" ADD CONSTRAINT "topic_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "topic_sessions_normalized" ON "topic_sessions" USING btree ("normalized_topic");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_topic_session_id_topic_sessions_id_fk" FOREIGN KEY ("topic_session_id") REFERENCES "public"."topic_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_items" ADD CONSTRAINT "question_items_topic_session_id_topic_sessions_id_fk" FOREIGN KEY ("topic_session_id") REFERENCES "public"."topic_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qi_topic_session" ON "question_items" USING btree ("topic_session_id","status");--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "ps_topic_kind_check" CHECK ("practice_sessions"."topic_kind" IS NULL OR "practice_sessions"."topic_kind" IN ('category', 'custom'));