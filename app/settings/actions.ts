"use server";

import { and, asc, count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { calendarCategories, calendarItems, generatedApps, kanbanBoards, kanbanTasks, notes, spaces, userSettings, whiteboards } from "@/db/schema";
import { CATEGORY_COLORS, DEFAULT_SETTINGS, normalizeSettings, validateCategory, validateSettingsPatch, type CategoryScope, type SettingsPatch, type UserCategory } from "@/lib/settings-domain";
import { getUserSettings, settingsValues } from "@/lib/settings-server";
import { requireDatabaseUser } from "@/lib/require-database-user";

const STARTER_CATEGORIES: Array<{ scope: CategoryScope; name: string; color: typeof CATEGORY_COLORS[number]; icon: string }> = [
  { scope: "calendar", name: "Work", color: "#7057E8", icon: "briefcase" },
  { scope: "calendar", name: "Personal", color: "#3979CA", icon: "home" },
  { scope: "task", name: "Focus", color: "#C37719", icon: "sparkles" },
  { scope: "task", name: "Admin", color: "#168C9B", icon: "briefcase" },
  { scope: "note", name: "Ideas", color: "#D44F82", icon: "sparkles" },
  { scope: "note", name: "Learning", color: "#359568", icon: "book-open" },
  { scope: "reminder", name: "Important", color: "#CE6542", icon: "bell" },
  { scope: "reminder", name: "Routine", color: "#3979CA", icon: "calendar-days" },
];

function category(row: typeof calendarCategories.$inferSelect): UserCategory {
  return { id: row.id, name: row.name, color: row.color, icon: row.icon, scope: row.scope as CategoryScope, position: row.position };
}

async function seedCategories(userId: number) {
  await db.insert(calendarCategories).values(STARTER_CATEGORIES.map((item, position) => ({ ...item, userId, position, isDefault: true }))).onConflictDoNothing();
}

export async function getSettingsPageData() {
  const { user, settings } = await getUserSettings();
  await seedCategories(user.id);
  const [categories, [calendarCount], [taskCount], [noteCount], [spaceCount], [whiteboardCount], [appCount]] = await Promise.all([
    db.select().from(calendarCategories).where(eq(calendarCategories.userId, user.id)).orderBy(asc(calendarCategories.scope), asc(calendarCategories.position), asc(calendarCategories.id)),
    db.select({ value: count() }).from(calendarItems).where(eq(calendarItems.userId, user.id)),
    db.select({ value: count() }).from(kanbanTasks).innerJoin(kanbanBoards, eq(kanbanTasks.boardId, kanbanBoards.id)).where(eq(kanbanBoards.userId, user.id)),
    db.select({ value: count() }).from(notes).where(eq(notes.userId, user.id)),
    db.select({ value: count() }).from(spaces).where(eq(spaces.userId, user.id)),
    db.select({ value: count() }).from(whiteboards).where(eq(whiteboards.userId, user.id)),
    db.select({ value: count() }).from(generatedApps).where(eq(generatedApps.userId, user.id)),
  ]);
  return {
    profile: { name: user.name || "Flowspace user", email: user.email, imageUrl: user.imageUrl, createdAt: user.createdAt.toISOString() },
    settings,
    categories: categories.map(category),
    usage: { calendar: calendarCount.value, tasks: taskCount.value, notes: noteCount.value, spaces: spaceCount.value, whiteboards: whiteboardCount.value, aiApps: appCount.value },
  };
}

export async function updateSettingsAction(input: SettingsPatch) {
  const { user, settings } = await getUserSettings();
  const patch = validateSettingsPatch(input);
  const next = normalizeSettings({ ...settings, ...patch });
  await db.update(userSettings).set({ ...settingsValues(next), updatedAt: new Date() }).where(eq(userSettings.userId, user.id));
  if (patch.theme) (await cookies()).set("flowspace-theme", patch.theme, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return next;
}

export async function createCategoryAction(input: { name: string; color: string; icon: string; scope: CategoryScope }) {
  const user = await requireDatabaseUser("categories");
  const value = validateCategory(input);
  const existing = await db.select({ id: calendarCategories.id }).from(calendarCategories).where(and(eq(calendarCategories.userId, user.id), eq(calendarCategories.scope, value.scope), eq(calendarCategories.name, value.name))).limit(1);
  if (existing.length) throw new Error("A category with that name already exists in this section.");
  const positions = await db.select({ value: count() }).from(calendarCategories).where(and(eq(calendarCategories.userId, user.id), eq(calendarCategories.scope, value.scope)));
  const [row] = await db.insert(calendarCategories).values({ userId: user.id, ...value, position: positions[0].value, isDefault: false }).returning();
  revalidatePath("/", "layout");
  return category(row);
}

export async function updateCategoryAction(id: number, input: { name: string; color: string; icon: string; scope: CategoryScope }) {
  const user = await requireDatabaseUser("categories");
  const value = validateCategory(input);
  const [owned] = await db.select().from(calendarCategories).where(and(eq(calendarCategories.id, id), eq(calendarCategories.userId, user.id))).limit(1);
  if (!owned) throw new Error("Category not found.");
  if (owned.scope !== value.scope) throw new Error("A category cannot be moved to another module.");
  const duplicate = await db.select({ id: calendarCategories.id }).from(calendarCategories).where(and(eq(calendarCategories.userId, user.id), eq(calendarCategories.scope, value.scope), eq(calendarCategories.name, value.name))).limit(1);
  if (duplicate[0] && duplicate[0].id !== id) throw new Error("A category with that name already exists in this section.");
  const [row] = await db.update(calendarCategories).set({ name: value.name, color: value.color, icon: value.icon, updatedAt: new Date() }).where(and(eq(calendarCategories.id, id), eq(calendarCategories.userId, user.id))).returning();
  revalidatePath("/", "layout");
  return category(row);
}

export async function deleteCategoryAction(id: number) {
  const user = await requireDatabaseUser("categories");
  const [row] = await db.delete(calendarCategories).where(and(eq(calendarCategories.id, id), eq(calendarCategories.userId, user.id))).returning({ id: calendarCategories.id });
  if (!row) throw new Error("Category not found.");
  revalidatePath("/", "layout");
}
