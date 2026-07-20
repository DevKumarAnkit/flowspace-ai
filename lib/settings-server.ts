import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarCategories, userSettings } from "@/db/schema";
import { DEFAULT_SETTINGS, normalizeSettings, type SettingsSnapshot } from "@/lib/settings-domain";
import type { CategoryScope, UserCategory } from "@/lib/settings-domain";
import { requireDatabaseUser } from "@/lib/require-database-user";

export function settingsValues(settings: SettingsSnapshot) {
  return {
    theme: settings.theme,
    notifications: settings.notifications,
    defaultCalendarView: settings.defaultCalendarView,
    defaultTaskPriority: settings.defaultTaskPriority,
    autoSave: settings.autoSave,
    aiModel: settings.aiModel,
    aiBehavior: settings.aiBehavior,
    aiTone: settings.aiTone,
    aiFeatures: settings.aiFeatures,
  };
}

export async function getUserCategories(scope: CategoryScope): Promise<UserCategory[]> {
  const user = await requireDatabaseUser("categories");
  const rows = await db.select().from(calendarCategories).where(and(eq(calendarCategories.userId, user.id), eq(calendarCategories.scope, scope))).orderBy(asc(calendarCategories.position), asc(calendarCategories.id));
  return rows.map((row) => ({ id: row.id, name: row.name, color: row.color, icon: row.icon, scope, position: row.position }));
}

export async function getUserSettings() {
  const user = await requireDatabaseUser("settings");
  let [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1);
  if (!row) {
    [row] = await db.insert(userSettings).values({ userId: user.id, ...settingsValues(DEFAULT_SETTINGS) }).returning();
  }
  return { user, settings: normalizeSettings({
    theme: row.theme as SettingsSnapshot["theme"],
    notifications: row.notifications as SettingsSnapshot["notifications"],
    defaultCalendarView: row.defaultCalendarView as SettingsSnapshot["defaultCalendarView"],
    defaultTaskPriority: row.defaultTaskPriority as SettingsSnapshot["defaultTaskPriority"],
    autoSave: row.autoSave,
    aiModel: row.aiModel as SettingsSnapshot["aiModel"],
    aiBehavior: row.aiBehavior as SettingsSnapshot["aiBehavior"],
    aiTone: row.aiTone as SettingsSnapshot["aiTone"],
    aiFeatures: row.aiFeatures as SettingsSnapshot["aiFeatures"],
  }) };
}
