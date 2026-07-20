ALTER TABLE "kanban_tasks" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD CONSTRAINT "kanban_tasks_category_id_calendar_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."calendar_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "calendar_categories" ("user_id", "name", "color", "scope", "icon", "position", "is_default")
SELECT DISTINCT board."user_id", label."name", label."color", 'task', 'tag', 0, false
FROM "kanban_labels" label JOIN "kanban_boards" board ON board."id" = label."board_id"
ON CONFLICT ("user_id", "scope", "name") DO NOTHING;
