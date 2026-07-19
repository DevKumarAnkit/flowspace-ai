CREATE TABLE "calendar_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_item_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"original_start" text NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"overrides" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_draft" boolean DEFAULT false NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"all_day" boolean DEFAULT true NOT NULL,
	"start_date" date,
	"end_date" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"time_zone" text NOT NULL,
	"notification_offset" integer,
	"recurrence_frequency" text DEFAULT 'none' NOT NULL,
	"recurrence_end_mode" text DEFAULT 'never' NOT NULL,
	"recurrence_end_date" date,
	"recurrence_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_categories" ADD CONSTRAINT "calendar_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_item_exceptions" ADD CONSTRAINT "calendar_item_exceptions_item_id_calendar_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."calendar_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_category_id_calendar_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."calendar_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_categories_user_name_idx" ON "calendar_categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_item_exceptions_occurrence_idx" ON "calendar_item_exceptions" USING btree ("item_id","original_start");