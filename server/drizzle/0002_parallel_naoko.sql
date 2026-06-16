CREATE TABLE IF NOT EXISTS "ai_task_config" (
	"task" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"fallback_model" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_task_config_provider_check" CHECK ("provider" IN ('openai','gemini'))
);
