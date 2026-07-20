CREATE TABLE "generated_apps" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"prompt" text NOT NULL,
	"definition" jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"sidebar_position" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generated_apps_sidebar_position_check" CHECK ("generated_apps"."sidebar_position" is null or ("generated_apps"."sidebar_position" >= 0 and "generated_apps"."sidebar_position" <= 2))
);
--> statement-breakpoint
ALTER TABLE "generated_apps" ADD CONSTRAINT "generated_apps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_apps_user_created_idx" ON "generated_apps" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_apps_user_sidebar_idx" ON "generated_apps" USING btree ("user_id","sidebar_position");