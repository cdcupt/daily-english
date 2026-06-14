CREATE TABLE IF NOT EXISTS "dimension_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total" integer NOT NULL,
	"overall_cefr" text NOT NULL,
	"dimensions" jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dimension_snapshots" ADD CONSTRAINT "dimension_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ds_user_time" ON "dimension_snapshots" USING btree ("user_id","captured_at");