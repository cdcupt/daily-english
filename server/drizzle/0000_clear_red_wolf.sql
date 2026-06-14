CREATE TYPE "public"."expression_type" AS ENUM('vocabulary', 'sentence_pattern', 'mistake_pair', 'saved', 'scenario_phrase');--> statement-breakpoint
CREATE TYPE "public"."input_type" AS ENUM('text', 'audio');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('draft', 'generated', 'auto_checked', 'review_pending', 'published', 'monitored', 'improved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('scenario_translation', 'scenario_dialogue', 'topic_description');--> statement-breakpoint
CREATE TYPE "public"."review_kind" AS ENUM('use_pattern', 'ask_politely', 're_enter_scenario');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('pending', 'served', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."session_state" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('ai_generated', 'original', 'tatoeba', 'cefr_descriptor', 'user_generated');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_feedback_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"raw_model_output" jsonb,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"repaired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "source_type" NOT NULL,
	"license" text NOT NULL,
	"attribution" text,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expression_bank_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "expression_type" NOT NULL,
	"content" text NOT NULL,
	"meaning_cn" text,
	"user_original" text,
	"natural_expression" text,
	"source_session_id" uuid,
	"source_scenario_id" uuid,
	"review_status" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"state" "session_state" DEFAULT 'active' NOT NULL,
	"score_report" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"item_id" uuid,
	"turn_index" integer NOT NULL,
	"input_type" "input_type" NOT NULL,
	"user_text" text,
	"audio_url" text,
	"transcript" text,
	"asr_confidence" real,
	"asr_words" jsonb,
	"speech_features" jsonb,
	"low_confidence" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "question_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_key" text NOT NULL,
	"scenario_id" uuid NOT NULL,
	"type" "item_type" NOT NULL,
	"status" "item_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"cefr_level" text NOT NULL,
	"difficulty_score" integer NOT NULL,
	"learning_goal" text NOT NULL,
	"prompt_cn" text,
	"reference_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_phrases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"common_mistakes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rubric" jsonb NOT NULL,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "question_quality_metrics" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"completion_rate" real DEFAULT 0 NOT NULL,
	"dropoff_rate" real DEFAULT 0 NOT NULL,
	"average_score" real DEFAULT 0 NOT NULL,
	"save_rate" real DEFAULT 0 NOT NULL,
	"complaint_rate" real DEFAULT 0 NOT NULL,
	"sample_n" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expression_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"kind" "review_kind" NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"state" "review_state" DEFAULT 'pending' NOT NULL,
	"generated_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"cefr_band" text NOT NULL,
	"user_role" text NOT NULL,
	"ai_role" text NOT NULL,
	"goal" text NOT NULL,
	"key_phrases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"common_mistakes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"practice_modes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_ability_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"overall_cefr" text DEFAULT 'A1' NOT NULL,
	"stable_range" text[] DEFAULT '{"A1","A1"}' NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"native_language" text DEFAULT 'zh' NOT NULL,
	"is_operator" boolean DEFAULT false NOT NULL,
	"merged_into" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_feedback_items" ADD CONSTRAINT "ai_feedback_items_turn_id_practice_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."practice_turns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expression_bank_items" ADD CONSTRAINT "expression_bank_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expression_bank_items" ADD CONSTRAINT "expression_bank_items_source_session_id_practice_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expression_bank_items" ADD CONSTRAINT "expression_bank_items_source_scenario_id_scenarios_id_fk" FOREIGN KEY ("source_scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_turns" ADD CONSTRAINT "practice_turns_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_turns" ADD CONSTRAINT "practice_turns_item_id_question_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."question_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_items" ADD CONSTRAINT "question_items_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_items" ADD CONSTRAINT "question_items_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_quality_metrics" ADD CONSTRAINT "question_quality_metrics_item_id_question_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."question_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_expression_id_expression_bank_items_id_fk" FOREIGN KEY ("expression_id") REFERENCES "public"."expression_bank_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_ability_profiles" ADD CONSTRAINT "user_ability_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "afi_turn" ON "ai_feedback_items" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ebi_user_type" ON "expression_bank_items" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_user_started" ON "practice_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pt_session_turn" ON "practice_turns" USING btree ("session_id","turn_index");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qi_item_key" ON "question_items" USING btree ("item_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qi_adaptive" ON "question_items" USING btree ("status","cefr_level","difficulty_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qi_scenario" ON "question_items" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rt_user_state_due" ON "review_tasks" USING btree ("user_id","state","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scenarios_slug" ON "scenarios" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenarios_category" ON "scenarios" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenarios_cefr" ON "scenarios" USING btree ("cefr_band");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_device_id" ON "users" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email" ON "users" USING btree ("email");