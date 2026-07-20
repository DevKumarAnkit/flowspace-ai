import {
  boolean,
  check,
  date,
  integer,
  index,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  name: text("name"),
  email: text("email").notNull().unique(),
  imageUrl: text("image_url"),
  calendarCategoriesSeeded: boolean("calendar_categories_seeded").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const userSettings = pgTable("user_settings", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").default("system").notNull(),
  notifications: jsonb("notifications").$type<Record<string, boolean>>().default({}).notNull(),
  defaultCalendarView: text("default_calendar_view").default("month").notNull(),
  defaultTaskPriority: text("default_task_priority").default("medium").notNull(),
  autoSave: boolean("auto_save").default(true).notNull(),
  aiModel: text("ai_model").default("gemini-3.5-flash").notNull(),
  aiBehavior: text("ai_behavior").default("balanced").notNull(),
  aiTone: text("ai_tone").default("professional").notNull(),
  aiFeatures: jsonb("ai_features").$type<Record<string, boolean>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserSettingsRow = typeof userSettings.$inferSelect;

export const calendarCategories = pgTable(
  "calendar_categories",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    scope: text("scope").default("calendar").notNull(),
    icon: text("icon").default("tag").notNull(),
    position: integer("position").default(0).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("calendar_categories_user_scope_name_idx").on(table.userId, table.scope, table.name)],
);

export const calendarItems = pgTable("calendar_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => calendarCategories.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  isDraft: boolean("is_draft").default(false).notNull(),
  isCompleted: boolean("is_completed").default(false).notNull(),
  allDay: boolean("all_day").default(true).notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  timeZone: text("time_zone").notNull(),
  notificationOffset: integer("notification_offset"),
  recurrenceFrequency: text("recurrence_frequency").default("none").notNull(),
  recurrenceEndMode: text("recurrence_end_mode").default("never").notNull(),
  recurrenceEndDate: date("recurrence_end_date"),
  recurrenceCount: integer("recurrence_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const calendarItemExceptions = pgTable(
  "calendar_item_exceptions",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull().references(() => calendarItems.id, { onDelete: "cascade" }),
    originalStart: text("original_start").notNull(),
    cancelled: boolean("cancelled").default(false).notNull(),
    overrides: jsonb("overrides").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("calendar_item_exceptions_occurrence_idx").on(table.itemId, table.originalStart)],
);

export type CalendarCategoryRow = typeof calendarCategories.$inferSelect;
export type CalendarItemRow = typeof calendarItems.$inferSelect;
export type CalendarItemExceptionRow = typeof calendarItemExceptions.$inferSelect;

export const kanbanBoards = pgTable("kanban_boards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const kanbanBoardMembers = pgTable(
  "kanban_board_members",
  {
    id: serial("id").primaryKey(),
    boardId: integer("board_id").notNull().references(() => kanbanBoards.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").default("editor").notNull(),
    invitedByUserId: integer("invited_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("kanban_board_members_board_email_idx").on(table.boardId, table.email),
    uniqueIndex("kanban_board_members_board_user_idx").on(table.boardId, table.userId),
  ],
);

export const kanbanColumns = pgTable("kanban_columns", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => kanbanBoards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").default(0).notNull(),
  isCompletion: boolean("is_completion").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const kanbanTasks = pgTable(
  "kanban_tasks",
  {
    id: serial("id").primaryKey(),
    boardId: integer("board_id").notNull().references(() => kanbanBoards.id, { onDelete: "cascade" }),
    columnId: integer("column_id").notNull().references(() => kanbanColumns.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date").notNull(),
    priority: text("priority").notNull(),
    categoryId: integer("category_id").references(() => calendarCategories.id, { onDelete: "set null" }),
    position: integer("position").default(0).notNull(),
    notesLinked: boolean("notes_linked").default(false).notNull(),
    calendarItemId: integer("calendar_item_id").references(() => calendarItems.id, { onDelete: "set null" }),
    lastNonCompletionColumnId: integer("last_non_completion_column_id").references(() => kanbanColumns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("kanban_tasks_calendar_item_idx").on(table.calendarItemId)],
);

export const kanbanLabels = pgTable("kanban_labels", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => kanbanBoards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const kanbanTaskLabels = pgTable(
  "kanban_task_labels",
  {
    taskId: integer("task_id").notNull().references(() => kanbanTasks.id, { onDelete: "cascade" }),
    labelId: integer("label_id").notNull().references(() => kanbanLabels.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.labelId] })],
);

export type KanbanBoardRow = typeof kanbanBoards.$inferSelect;
export type KanbanBoardMemberRow = typeof kanbanBoardMembers.$inferSelect;
export type KanbanColumnRow = typeof kanbanColumns.$inferSelect;
export type KanbanTaskRow = typeof kanbanTasks.$inferSelect;
export type KanbanLabelRow = typeof kanbanLabels.$inferSelect;

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => calendarCategories.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    color: text("color").notNull(),
    icon: text("icon").default("file").notNull(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notes_user_updated_idx").on(table.userId, table.updatedAt),
    index("notes_user_trashed_idx").on(table.userId, table.trashedAt),
  ],
);

export type NoteRow = typeof notes.$inferSelect;

export const whiteboards = pgTable(
  "whiteboards",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    scene: jsonb("scene").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("whiteboards_user_updated_idx").on(table.userId, table.updatedAt)],
);

export type WhiteboardRow = typeof whiteboards.$inferSelect;

export const spaces = pgTable(
  "spaces",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull(),
    isFavorite: boolean("is_favorite").default(false).notNull(),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("spaces_user_updated_idx").on(table.userId, table.updatedAt),
    index("spaces_user_archived_idx").on(table.userId, table.archivedAt),
  ],
);

export const spacePages = pgTable(
  "space_pages",
  {
    id: serial("id").primaryKey(),
    spaceId: integer("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    updatedByUserId: integer("updated_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    template: text("template").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    isFavorite: boolean("is_favorite").default(false).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("space_pages_space_updated_idx").on(table.spaceId, table.updatedAt),
    index("space_pages_space_archived_idx").on(table.spaceId, table.archivedAt),
  ],
);

export const spaceMembers = pgTable(
  "space_members",
  {
    id: serial("id").primaryKey(),
    spaceId: integer("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").default("editor").notNull(),
    invitedByUserId: integer("invited_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("space_members_space_email_idx").on(table.spaceId, table.email),
    uniqueIndex("space_members_space_user_idx").on(table.spaceId, table.userId),
  ],
);

export const spacePageTaskLinks = pgTable(
  "space_page_task_links",
  {
    pageId: integer("page_id").notNull().references(() => spacePages.id, { onDelete: "cascade" }),
    taskId: integer("task_id").notNull().references(() => kanbanTasks.id, { onDelete: "cascade" }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.pageId, table.taskId] })],
);

export type SpaceRow = typeof spaces.$inferSelect;
export type SpacePageRow = typeof spacePages.$inferSelect;
export type SpaceMemberRow = typeof spaceMembers.$inferSelect;

export const generatedApps = pgTable(
  "generated_apps",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    sidebarPosition: integer("sidebar_position"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("generated_apps_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("generated_apps_user_sidebar_idx").on(table.userId, table.sidebarPosition),
    check("generated_apps_sidebar_position_check", sql`${table.sidebarPosition} is null or (${table.sidebarPosition} >= 0 and ${table.sidebarPosition} <= 2)`),
  ],
);

export type GeneratedAppRow = typeof generatedApps.$inferSelect;

export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("assistant_conversations_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").notNull().references(() => assistantConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("assistant_messages_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

export const assistantActionRequests = pgTable(
  "assistant_action_requests",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").notNull().references(() => assistantConversations.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("assistant_actions_user_status_idx").on(table.userId, table.status)],
);
