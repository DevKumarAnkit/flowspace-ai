"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { calendarCategories, calendarItemExceptions, calendarItems, users } from "@/db/schema";
import type { CalendarItemInput } from "@/lib/calendar-types";
import { CATEGORY_COLORS } from "@/lib/calendar-types";
import { syncUser } from "@/lib/sync-user";

const DEFAULT_CATEGORIES = [
  ["Work", "#7057E8"],
  ["Personal", "#D44F82"],
  ["Study", "#3979CA"],
  ["Health", "#359568"],
  ["Meetings", "#CE6542"],
] as const;

async function requireDatabaseUser() {
  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("You must be signed in to use the calendar.");
  await syncUser(clerkUser);
  const [databaseUser] = await db.select().from(users).where(eq(users.clerkId, clerkUser.id)).limit(1);
  if (!databaseUser) throw new Error("Unable to resolve the signed-in user.");
  return databaseUser;
}

async function ensureDefaultCategories(user: typeof users.$inferSelect) {
  if (user.calendarCategoriesSeeded) return;
  for (const [name, color] of DEFAULT_CATEGORIES) {
    await db
      .insert(calendarCategories)
      .values({ userId: user.id, name, color, isDefault: true })
      .onConflictDoNothing({ target: [calendarCategories.userId, calendarCategories.name] });
  }
  await db.update(users).set({ calendarCategoriesSeeded: true, updatedAt: new Date() }).where(eq(users.id, user.id));
}

export async function getCalendarData() {
  const user = await requireDatabaseUser();
  await ensureDefaultCategories(user);
  const [categories, items, exceptions] = await Promise.all([
    db.select().from(calendarCategories).where(eq(calendarCategories.userId, user.id)).orderBy(asc(calendarCategories.id)),
    db.select().from(calendarItems).where(eq(calendarItems.userId, user.id)).orderBy(asc(calendarItems.createdAt)),
    db
      .select({ exception: calendarItemExceptions })
      .from(calendarItemExceptions)
      .innerJoin(calendarItems, eq(calendarItemExceptions.itemId, calendarItems.id))
      .where(eq(calendarItems.userId, user.id)),
  ]);

  return {
    categories: categories.map(({ id, name, color, isDefault }) => ({ id, name, color, isDefault })),
    items: items.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      type: item.type as "task" | "reminder",
      title: item.title,
      description: item.description ?? "",
      isDraft: item.isDraft,
      isCompleted: item.isCompleted,
      allDay: item.allDay,
      startDate: item.startDate,
      endDate: item.endDate,
      startsAt: item.startsAt?.toISOString() ?? null,
      endsAt: item.endsAt?.toISOString() ?? null,
      timeZone: item.timeZone,
      notificationOffset: item.notificationOffset,
      recurrenceFrequency: item.recurrenceFrequency as CalendarItemInput["recurrenceFrequency"],
      recurrenceEndMode: item.recurrenceEndMode as CalendarItemInput["recurrenceEndMode"],
      recurrenceEndDate: item.recurrenceEndDate,
      recurrenceCount: item.recurrenceCount,
      exceptions: exceptions
        .map(({ exception }) => exception)
        .filter((entry) => entry.itemId === item.id)
        .map((entry) => ({
          id: entry.id,
          itemId: entry.itemId,
          originalStart: entry.originalStart,
          cancelled: entry.cancelled,
          overrides: entry.overrides as never,
        })),
    })),
  };
}

function validateItem(input: CalendarItemInput) {
  const title = input.title.trim();
  if (!title || title.length > 160) throw new Error("Enter a title up to 160 characters.");
  if (!["task", "reminder"].includes(input.type)) throw new Error("Choose a valid item type.");
  if (!["none", "daily", "weekly", "monthly", "yearly"].includes(input.recurrenceFrequency)) {
    throw new Error("Choose a valid repeat option.");
  }
  if (!["never", "date", "count"].includes(input.recurrenceEndMode)) throw new Error("Choose a valid repeat ending.");
  if (input.type === "reminder" && ![0, 5, 10, 30, 1440].includes(input.notificationOffset ?? 10)) {
    throw new Error("Choose a supported reminder time.");
  }
  if (!input.isDraft) {
    if (input.allDay) {
      if (!input.startDate || !input.endDate || input.endDate <= input.startDate) {
        throw new Error("All-day items need a valid start and end date.");
      }
    } else {
      if (!input.startsAt || !input.endsAt || new Date(input.endsAt) <= new Date(input.startsAt)) {
        throw new Error("The end time must be after the start time.");
      }
    }
  }
  if (input.isDraft && input.type !== "task") throw new Error("Only tasks can be saved as drafts.");
  if (input.recurrenceEndMode === "count" && (input.recurrenceCount ?? 0) < 1) {
    throw new Error("Occurrence count must be at least one.");
  }
  return title;
}

function itemValues(userId: number, input: CalendarItemInput) {
  const title = validateItem(input);
  const draft = Boolean(input.isDraft);
  return {
    userId,
    categoryId: input.categoryId,
    type: input.type,
    title,
    description: input.description.trim() || null,
    isDraft: draft,
    isCompleted: Boolean(input.isCompleted),
    allDay: draft ? true : input.allDay,
    startDate: draft || !input.allDay ? null : input.startDate,
    endDate: draft || !input.allDay ? null : input.endDate,
    startsAt: draft || input.allDay || !input.startsAt ? null : new Date(input.startsAt),
    endsAt: draft || input.allDay || !input.endsAt ? null : new Date(input.endsAt),
    timeZone: input.timeZone,
    notificationOffset: input.type === "reminder" ? input.notificationOffset : null,
    recurrenceFrequency: draft ? "none" : input.recurrenceFrequency,
    recurrenceEndMode: draft || input.recurrenceFrequency === "none" ? "never" : input.recurrenceEndMode,
    recurrenceEndDate: input.recurrenceEndMode === "date" ? input.recurrenceEndDate : null,
    recurrenceCount: input.recurrenceEndMode === "count" ? input.recurrenceCount : null,
    updatedAt: new Date(),
  };
}

export async function saveCalendarItemAction(
  input: CalendarItemInput,
  occurrenceStart?: string,
  scope: "occurrence" | "series" = "series",
) {
  const user = await requireDatabaseUser();
  if (input.categoryId) {
    const [category] = await db
      .select({ id: calendarCategories.id })
      .from(calendarCategories)
      .where(and(eq(calendarCategories.id, input.categoryId), eq(calendarCategories.userId, user.id)))
      .limit(1);
    if (!category) throw new Error("That category is not available.");
  }
  const values = itemValues(user.id, input);

  if (!input.id) {
    await db.insert(calendarItems).values(values);
  } else {
    const [owned] = await db
      .select({ id: calendarItems.id })
      .from(calendarItems)
      .where(and(eq(calendarItems.id, input.id), eq(calendarItems.userId, user.id)))
      .limit(1);
    if (!owned) throw new Error("Calendar item not found.");

    if (scope === "occurrence" && occurrenceStart) {
      const { userId: _userId, ...overrides } = values;
      await db
        .insert(calendarItemExceptions)
        .values({ itemId: input.id, originalStart: occurrenceStart, cancelled: false, overrides })
        .onConflictDoUpdate({
          target: [calendarItemExceptions.itemId, calendarItemExceptions.originalStart],
          set: { cancelled: false, overrides, updatedAt: new Date() },
        });
    } else {
      await db
        .update(calendarItems)
        .set(values)
        .where(and(eq(calendarItems.id, input.id), eq(calendarItems.userId, user.id)));
    }
  }
  revalidatePath("/calendar");
}

export async function deleteCalendarItemAction(
  itemId: number,
  occurrenceStart?: string,
  scope: "occurrence" | "series" = "series",
) {
  const user = await requireDatabaseUser();
  const owned = and(eq(calendarItems.id, itemId), eq(calendarItems.userId, user.id));
  const [item] = await db.select({ id: calendarItems.id }).from(calendarItems).where(owned).limit(1);
  if (!item) throw new Error("Calendar item not found.");
  if (scope === "occurrence" && occurrenceStart) {
    await db
      .insert(calendarItemExceptions)
      .values({ itemId, originalStart: occurrenceStart, cancelled: true })
      .onConflictDoUpdate({
        target: [calendarItemExceptions.itemId, calendarItemExceptions.originalStart],
        set: { cancelled: true, overrides: null, updatedAt: new Date() },
      });
  } else {
    await db.delete(calendarItems).where(owned);
  }
  revalidatePath("/calendar");
}

export async function toggleCalendarTaskAction(itemId: number, completed: boolean) {
  const user = await requireDatabaseUser();
  await db
    .update(calendarItems)
    .set({ isCompleted: completed, updatedAt: new Date() })
    .where(and(eq(calendarItems.id, itemId), eq(calendarItems.userId, user.id), eq(calendarItems.type, "task")));
  revalidatePath("/calendar");
}

export async function createCalendarCategoryAction(name: string, color: string) {
  const user = await requireDatabaseUser();
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 40) throw new Error("Enter a category name up to 40 characters.");
  if (!CATEGORY_COLORS.includes(color as (typeof CATEGORY_COLORS)[number])) throw new Error("Choose a supported color.");
  await db.insert(calendarCategories).values({ userId: user.id, name: cleanName, color, isDefault: false });
  revalidatePath("/calendar");
}

export async function updateCalendarCategoryAction(id: number, name: string, color: string) {
  const user = await requireDatabaseUser();
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 40) throw new Error("Enter a category name up to 40 characters.");
  if (!CATEGORY_COLORS.includes(color as (typeof CATEGORY_COLORS)[number])) throw new Error("Choose a supported color.");
  await db
    .update(calendarCategories)
    .set({ name: cleanName, color, updatedAt: new Date() })
    .where(and(eq(calendarCategories.id, id), eq(calendarCategories.userId, user.id)));
  revalidatePath("/calendar");
}

export async function deleteCalendarCategoryAction(id: number) {
  const user = await requireDatabaseUser();
  await db
    .delete(calendarCategories)
    .where(and(eq(calendarCategories.id, id), eq(calendarCategories.userId, user.id)));
  revalidatePath("/calendar");
}
