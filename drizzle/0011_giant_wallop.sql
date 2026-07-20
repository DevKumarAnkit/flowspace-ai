CREATE TABLE "user_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"notifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_calendar_view" text DEFAULT 'month' NOT NULL,
	"default_task_priority" text DEFAULT 'medium' NOT NULL,
	"auto_save" boolean DEFAULT true NOT NULL,
	"ai_model" text DEFAULT 'gemini-3.5-flash' NOT NULL,
	"ai_behavior" text DEFAULT 'balanced' NOT NULL,
	"ai_tone" text DEFAULT 'professional' NOT NULL,
	"ai_features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "calendar_categories_user_name_idx";--> statement-breakpoint
ALTER TABLE "calendar_categories" ADD COLUMN "scope" text DEFAULT 'calendar' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_categories" ADD COLUMN "icon" text DEFAULT 'tag' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_categories" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_category_id_calendar_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."calendar_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_categories_user_scope_name_idx" ON "calendar_categories" USING btree ("user_id","scope","name");--> statement-breakpoint
INSERT INTO "calendar_categories" ("user_id", "name", "color", "scope", "icon", "position", "is_default")
SELECT DISTINCT category."user_id", category."name", category."color", 'reminder', category."icon", category."position", category."is_default"
FROM "calendar_categories" category JOIN "calendar_items" item ON item."category_id" = category."id"
WHERE item."type" = 'reminder'
ON CONFLICT ("user_id", "scope", "name") DO NOTHING;--> statement-breakpoint
UPDATE "calendar_items" item SET "category_id" = reminder_category."id"
FROM "calendar_categories" original_category JOIN "calendar_categories" reminder_category
ON reminder_category."user_id" = original_category."user_id" AND reminder_category."scope" = 'reminder' AND reminder_category."name" = original_category."name"
WHERE item."type" = 'reminder' AND item."category_id" = original_category."id" AND original_category."scope" = 'calendar';
