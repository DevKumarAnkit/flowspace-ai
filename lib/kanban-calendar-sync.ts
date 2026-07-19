import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { calendarItems, kanbanBoards, kanbanColumns, kanbanTasks } from "@/db/schema";
import { restoreColumnId } from "@/lib/kanban-domain";

type LinkedTaskFields = {
  title: string;
  description: string;
  dueDate: string;
  timeZone: string;
  completed: boolean;
};

function dayAfter(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function calendarValues(userId: number, fields: LinkedTaskFields) {
  return {
    userId,
    categoryId: null,
    type: "task",
    title: fields.title,
    description: fields.description || null,
    isDraft: false,
    isCompleted: fields.completed,
    allDay: true,
    startDate: fields.dueDate,
    endDate: dayAfter(fields.dueDate),
    startsAt: null,
    endsAt: null,
    timeZone: fields.timeZone || "UTC",
    notificationOffset: null,
    recurrenceFrequency: "none",
    recurrenceEndMode: "never",
    recurrenceEndDate: null,
    recurrenceCount: null,
    updatedAt: new Date(),
  };
}

export async function createLinkedCalendarItem(userId: number, fields: LinkedTaskFields) {
  const [item] = await db.insert(calendarItems).values(calendarValues(userId, fields)).returning({ id: calendarItems.id });
  return item.id;
}

export async function updateLinkedCalendarItem(userId: number, itemId: number, fields: LinkedTaskFields) {
  await db.update(calendarItems).set(calendarValues(userId, fields)).where(and(eq(calendarItems.id, itemId), eq(calendarItems.userId, userId)));
}

export async function syncLinkedKanbanFromCalendar(
  userId: number,
  itemId: number,
  fields: { title: string; description: string; dueDate: string | null; completed: boolean },
) {
  const [linked] = await db
    .select({ task: kanbanTasks })
    .from(kanbanTasks)
    .innerJoin(kanbanBoards, eq(kanbanTasks.boardId, kanbanBoards.id))
    .where(and(eq(kanbanTasks.calendarItemId, itemId), eq(kanbanBoards.userId, userId)))
    .limit(1);
  if (!linked) return;

  const columns = await db.select().from(kanbanColumns).where(eq(kanbanColumns.boardId, linked.task.boardId)).orderBy(asc(kanbanColumns.position));
  const current = columns.find((column) => column.id === linked.task.columnId);
  let columnId = linked.task.columnId;
  let lastNonCompletionColumnId = linked.task.lastNonCompletionColumnId;
  if (fields.completed) {
    const completion = columns.find((column) => column.isCompletion);
    if (completion) {
      if (current && !current.isCompletion) lastNonCompletionColumnId = current.id;
      columnId = completion.id;
    }
  } else if (current?.isCompletion) {
    columnId = restoreColumnId(linked.task.lastNonCompletionColumnId, columns) ?? current.id;
  }

  const nextPosition = await db.select({ id: kanbanTasks.id }).from(kanbanTasks).where(eq(kanbanTasks.columnId, columnId));
  await db.update(kanbanTasks).set({
    title: fields.title,
    description: fields.description || null,
    ...(fields.dueDate ? { dueDate: fields.dueDate } : {}),
    columnId,
    position: columnId === linked.task.columnId ? linked.task.position : nextPosition.length,
    lastNonCompletionColumnId,
    updatedAt: new Date(),
  }).where(eq(kanbanTasks.id, linked.task.id));
}

export async function unlinkKanbanFromCalendar(userId: number, itemId: number) {
  const ownedBoards = await db.select({ id: kanbanBoards.id }).from(kanbanBoards).where(eq(kanbanBoards.userId, userId));
  if (!ownedBoards.length) return;
  await db.update(kanbanTasks).set({ calendarItemId: null, updatedAt: new Date() }).where(
    and(eq(kanbanTasks.calendarItemId, itemId), inArray(kanbanTasks.boardId, ownedBoards.map((board) => board.id))),
  );
}
