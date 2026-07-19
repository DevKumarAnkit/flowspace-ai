"use server";

import { and, asc, eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  calendarItems,
  kanbanBoards,
  kanbanColumns,
  kanbanLabels,
  kanbanTaskLabels,
  kanbanTasks,
} from "@/db/schema";
import { assertCanAddColumn, assertUniqueColumnName, cleanName, validateTaskFields } from "@/lib/kanban-domain";
import { createLinkedCalendarItem, updateLinkedCalendarItem } from "@/lib/kanban-calendar-sync";
import { KANBAN_COLORS, type KanbanData, type KanbanTaskInput } from "@/lib/kanban-types";
import { requireDatabaseUser } from "@/lib/require-database-user";

function refreshKanban() {
  revalidatePath("/kanban");
  revalidatePath("/calendar");
}

function validColor(color: string) {
  if (!KANBAN_COLORS.includes(color as (typeof KANBAN_COLORS)[number])) throw new Error("Choose a supported color.");
  return color;
}

async function ownedBoard(userId: number, boardId: number) {
  const [board] = await db.select().from(kanbanBoards).where(and(eq(kanbanBoards.id, boardId), eq(kanbanBoards.userId, userId))).limit(1);
  if (!board) throw new Error("Board not found.");
  return board;
}

export async function getKanbanData(): Promise<KanbanData> {
  const user = await requireDatabaseUser("Kanban");
  const boards = await db.select().from(kanbanBoards).where(eq(kanbanBoards.userId, user.id)).orderBy(asc(kanbanBoards.position), asc(kanbanBoards.id));
  if (!boards.length) return { boards: [] };
  const boardIds = boards.map((board) => board.id);
  const [columns, tasks, labels] = await Promise.all([
    db.select().from(kanbanColumns).where(inArray(kanbanColumns.boardId, boardIds)).orderBy(asc(kanbanColumns.position), asc(kanbanColumns.id)),
    db.select().from(kanbanTasks).where(inArray(kanbanTasks.boardId, boardIds)).orderBy(asc(kanbanTasks.position), asc(kanbanTasks.id)),
    db.select().from(kanbanLabels).where(inArray(kanbanLabels.boardId, boardIds)).orderBy(asc(kanbanLabels.id)),
  ]);
  const taskIds = tasks.map((task) => task.id);
  const links = taskIds.length ? await db.select().from(kanbanTaskLabels).where(inArray(kanbanTaskLabels.taskId, taskIds)) : [];

  return {
    boards: boards.map((board) => ({
      id: board.id,
      name: board.name,
      color: board.color,
      position: board.position,
      labels: labels.filter((label) => label.boardId === board.id).map(({ id, boardId, name, color }) => ({ id, boardId, name, color })),
      columns: columns.filter((column) => column.boardId === board.id).map((column) => ({
        id: column.id,
        boardId: column.boardId,
        name: column.name,
        position: column.position,
        isCompletion: column.isCompletion,
        tasks: tasks.filter((task) => task.columnId === column.id).map((task) => ({
          id: task.id,
          boardId: task.boardId,
          columnId: task.columnId,
          title: task.title,
          description: task.description ?? "",
          dueDate: task.dueDate,
          priority: task.priority as "low" | "medium" | "high",
          position: task.position,
          notesLinked: task.notesLinked,
          calendarItemId: task.calendarItemId,
          lastNonCompletionColumnId: task.lastNonCompletionColumnId,
          labels: labels.filter((label) => links.some((link) => link.taskId === task.id && link.labelId === label.id)).map(({ id, boardId, name, color }) => ({ id, boardId, name, color })),
        })),
      })),
    })),
  };
}

export async function createKanbanBoardAction(name: string, color: string) {
  const user = await requireDatabaseUser("Kanban");
  const clean = cleanName(name, "board");
  validColor(color);
  const [{ value }] = await db.select({ value: max(kanbanBoards.position) }).from(kanbanBoards).where(eq(kanbanBoards.userId, user.id));
  const [board] = await db.insert(kanbanBoards).values({ userId: user.id, name: clean, color, position: (value ?? -1) + 1 }).returning({ id: kanbanBoards.id });
  let columns: Array<typeof kanbanColumns.$inferSelect>;
  try {
    columns = await db.insert(kanbanColumns).values([
      { boardId: board.id, name: "Todo", position: 0, isCompletion: false },
      { boardId: board.id, name: "In Progress", position: 1, isCompletion: false },
      { boardId: board.id, name: "Done", position: 2, isCompletion: true },
    ]).returning();
  } catch (error) {
    await db.delete(kanbanBoards).where(and(eq(kanbanBoards.id, board.id), eq(kanbanBoards.userId, user.id)));
    throw error;
  }
  refreshKanban();
  return {
    id: board.id,
    name: clean,
    color,
    position: (value ?? -1) + 1,
    labels: [],
    columns: columns.map((column) => ({
      id: column.id,
      boardId: column.boardId,
      name: column.name,
      position: column.position,
      isCompletion: column.isCompletion,
      tasks: [],
    })),
  };
}

export async function updateKanbanBoardAction(id: number, name: string, color: string) {
  const user = await requireDatabaseUser("Kanban");
  await ownedBoard(user.id, id);
  await db.update(kanbanBoards).set({ name: cleanName(name, "board"), color: validColor(color), updatedAt: new Date() }).where(eq(kanbanBoards.id, id));
  refreshKanban();
}

export async function deleteKanbanBoardAction(id: number) {
  const user = await requireDatabaseUser("Kanban");
  await ownedBoard(user.id, id);
  const linked = await db.select({ id: kanbanTasks.calendarItemId }).from(kanbanTasks).where(eq(kanbanTasks.boardId, id));
  const calendarIds = linked.flatMap((entry) => entry.id == null ? [] : [entry.id]);
  if (calendarIds.length) await db.delete(calendarItems).where(and(eq(calendarItems.userId, user.id), inArray(calendarItems.id, calendarIds)));
  await db.delete(kanbanBoards).where(and(eq(kanbanBoards.id, id), eq(kanbanBoards.userId, user.id)));
  refreshKanban();
}

export async function createKanbanColumnAction(boardId: number, name: string) {
  const user = await requireDatabaseUser("Kanban");
  await ownedBoard(user.id, boardId);
  const columns = await db.select().from(kanbanColumns).where(eq(kanbanColumns.boardId, boardId));
  assertCanAddColumn(columns.length);
  const clean = cleanName(name, "column");
  assertUniqueColumnName(clean, columns);
  const [column] = await db.insert(kanbanColumns).values({ boardId, name: clean, position: columns.length, isCompletion: false }).returning();
  refreshKanban();
  return { id: column.id, boardId: column.boardId, name: column.name, position: column.position, isCompletion: false, tasks: [] };
}

export async function updateKanbanColumnAction(boardId: number, columnId: number, name: string) {
  const user = await requireDatabaseUser("Kanban");
  await ownedBoard(user.id, boardId);
  const [column] = await db.select().from(kanbanColumns).where(and(eq(kanbanColumns.id, columnId), eq(kanbanColumns.boardId, boardId))).limit(1);
  if (!column) throw new Error("Column not found.");
  const columns = await db.select({ id: kanbanColumns.id, name: kanbanColumns.name }).from(kanbanColumns).where(eq(kanbanColumns.boardId, boardId));
  const clean = cleanName(name, "column");
  assertUniqueColumnName(clean, columns, columnId);
  await db.update(kanbanColumns).set({ name: clean, updatedAt: new Date() }).where(eq(kanbanColumns.id, columnId));
  refreshKanban();
}

export async function deleteKanbanColumnAction(boardId: number, columnId: number) {
  const user = await requireDatabaseUser("Kanban");
  await ownedBoard(user.id, boardId);
  const columns = await db.select().from(kanbanColumns).where(eq(kanbanColumns.boardId, boardId)).orderBy(asc(kanbanColumns.position));
  if (columns.length <= 1) throw new Error("A board needs at least one column.");
  const column = columns.find((entry) => entry.id === columnId);
  if (!column) throw new Error("Column not found.");
  const remaining = columns.filter((entry) => entry.id !== columnId);
  let completionColumnId = remaining.find((entry) => entry.isCompletion)?.id ?? null;
  if (column.isCompletion) {
    completionColumnId = remaining[remaining.length - 1].id;
    await db.update(kanbanColumns).set({ isCompletion: true, updatedAt: new Date() }).where(eq(kanbanColumns.id, completionColumnId));
  }

  const tasks = await db.select({ id: kanbanTasks.id, calendarItemId: kanbanTasks.calendarItemId }).from(kanbanTasks).where(eq(kanbanTasks.columnId, columnId));
  const calendarIds = tasks.flatMap((task) => task.calendarItemId == null ? [] : [task.calendarItemId]);
  if (calendarIds.length) await db.delete(calendarItems).where(and(eq(calendarItems.userId, user.id), inArray(calendarItems.id, calendarIds)));
  if (tasks.length) await db.delete(kanbanTasks).where(inArray(kanbanTasks.id, tasks.map((task) => task.id)));
  await db.update(kanbanTasks).set({ lastNonCompletionColumnId: null }).where(eq(kanbanTasks.lastNonCompletionColumnId, columnId));
  await db.delete(kanbanColumns).where(eq(kanbanColumns.id, columnId));
  for (const [position, entry] of remaining.entries()) await db.update(kanbanColumns).set({ position }).where(eq(kanbanColumns.id, entry.id));
  refreshKanban();
  return { deletedColumnId: columnId, completionColumnId };
}

export async function createKanbanLabelAction(boardId: number, name: string, color: string) {
  const user = await requireDatabaseUser("Kanban");
  await ownedBoard(user.id, boardId);
  const [label] = await db.insert(kanbanLabels).values({ boardId, name: cleanName(name, "label"), color: validColor(color) }).returning();
  refreshKanban();
  return { id: label.id, boardId: label.boardId, name: label.name, color: label.color };
}

export async function updateKanbanLabelAction(boardId: number, labelId: number, name: string, color: string) {
  const user = await requireDatabaseUser("Kanban");
  await ownedBoard(user.id, boardId);
  await db.update(kanbanLabels).set({ name: cleanName(name, "label"), color: validColor(color), updatedAt: new Date() }).where(and(eq(kanbanLabels.id, labelId), eq(kanbanLabels.boardId, boardId)));
  refreshKanban();
}

export async function deleteKanbanLabelAction(boardId: number, labelId: number) {
  const user = await requireDatabaseUser("Kanban");
  await ownedBoard(user.id, boardId);
  await db.delete(kanbanLabels).where(and(eq(kanbanLabels.id, labelId), eq(kanbanLabels.boardId, boardId)));
  refreshKanban();
}

async function checkedTaskContext(userId: number, input: KanbanTaskInput) {
  await ownedBoard(userId, input.boardId);
  const columns = await db.select().from(kanbanColumns).where(eq(kanbanColumns.boardId, input.boardId)).orderBy(asc(kanbanColumns.position));
  const column = columns.find((entry) => entry.id === input.columnId);
  if (!column) throw new Error("Column not found.");
  const labels = input.labelIds.length ? await db.select().from(kanbanLabels).where(and(eq(kanbanLabels.boardId, input.boardId), inArray(kanbanLabels.id, input.labelIds))) : [];
  if (labels.length !== new Set(input.labelIds).size) throw new Error("One or more labels are unavailable.");
  return { columns, column };
}

export async function saveKanbanTaskAction(input: KanbanTaskInput) {
  const user = await requireDatabaseUser("Kanban");
  const fields = validateTaskFields(input.title, input.description, input.dueDate, input.priority);
  const { column } = await checkedTaskContext(user.id, input);
  let existing: typeof kanbanTasks.$inferSelect | undefined;
  if (input.id) {
    [existing] = await db.select({ task: kanbanTasks }).from(kanbanTasks).innerJoin(kanbanBoards, eq(kanbanTasks.boardId, kanbanBoards.id)).where(and(eq(kanbanTasks.id, input.id), eq(kanbanBoards.userId, user.id))).limit(1).then((rows) => rows.map((row) => row.task));
    if (!existing) throw new Error("Task not found.");
  }
  const position = existing?.columnId === column.id ? existing.position : (await db.select({ id: kanbanTasks.id }).from(kanbanTasks).where(eq(kanbanTasks.columnId, column.id))).length;
  const values = {
    boardId: input.boardId,
    columnId: input.columnId,
    title: fields.title,
    description: fields.description || null,
    dueDate: input.dueDate,
    priority: fields.priority,
    notesLinked: input.notesLinked,
    position,
    lastNonCompletionColumnId: column.isCompletion ? existing?.lastNonCompletionColumnId ?? null : column.id,
    updatedAt: new Date(),
  };
  const task = existing
    ? (await db.update(kanbanTasks).set(values).where(eq(kanbanTasks.id, existing.id)).returning())[0]
    : (await db.insert(kanbanTasks).values(values).returning())[0];

  let calendarItemId = existing?.calendarItemId ?? null;
  const linkedFields = { title: fields.title, description: fields.description, dueDate: input.dueDate, timeZone: input.timeZone, completed: column.isCompletion };
  if (input.calendarSync && calendarItemId) await updateLinkedCalendarItem(user.id, calendarItemId, linkedFields);
  else if (input.calendarSync) {
    calendarItemId = await createLinkedCalendarItem(user.id, linkedFields);
    await db.update(kanbanTasks).set({ calendarItemId }).where(eq(kanbanTasks.id, task.id));
  } else if (calendarItemId) {
    await db.update(kanbanTasks).set({ calendarItemId: null }).where(eq(kanbanTasks.id, task.id));
    await db.delete(calendarItems).where(and(eq(calendarItems.id, calendarItemId), eq(calendarItems.userId, user.id)));
  }

  await db.delete(kanbanTaskLabels).where(eq(kanbanTaskLabels.taskId, task.id));
  const labelIds = [...new Set(input.labelIds)];
  if (labelIds.length) await db.insert(kanbanTaskLabels).values(labelIds.map((labelId) => ({ taskId: task.id, labelId })));
  refreshKanban();
}

export async function deleteKanbanTaskAction(taskId: number) {
  const user = await requireDatabaseUser("Kanban");
  const [entry] = await db.select({ task: kanbanTasks }).from(kanbanTasks).innerJoin(kanbanBoards, eq(kanbanTasks.boardId, kanbanBoards.id)).where(and(eq(kanbanTasks.id, taskId), eq(kanbanBoards.userId, user.id))).limit(1);
  if (!entry) throw new Error("Task not found.");
  await db.delete(kanbanTasks).where(eq(kanbanTasks.id, taskId));
  if (entry.task.calendarItemId) await db.delete(calendarItems).where(and(eq(calendarItems.id, entry.task.calendarItemId), eq(calendarItems.userId, user.id)));
  refreshKanban();
}

export async function moveKanbanTaskAction(boardId: number, taskId: number, targetColumnId: number, orders: Array<{ columnId: number; taskIds: number[] }>) {
  const user = await requireDatabaseUser("Kanban");
  await ownedBoard(user.id, boardId);
  const [task] = await db.select().from(kanbanTasks).where(and(eq(kanbanTasks.id, taskId), eq(kanbanTasks.boardId, boardId))).limit(1);
  const columns = await db.select().from(kanbanColumns).where(eq(kanbanColumns.boardId, boardId));
  const target = columns.find((column) => column.id === targetColumnId);
  if (!task || !target) throw new Error("Unable to move that task.");
  const allTaskIds = orders.flatMap((order) => order.taskIds);
  const uniqueIds = [...new Set(allTaskIds)];
  const boardTasks = await db.select({ id: kanbanTasks.id }).from(kanbanTasks).where(eq(kanbanTasks.boardId, boardId));
  if (uniqueIds.length !== allTaskIds.length || boardTasks.length !== uniqueIds.length || boardTasks.some((entry) => !uniqueIds.includes(entry.id))) {
    throw new Error("The board changed while you were moving the task.");
  }
  await db.update(kanbanTasks).set({
    columnId: target.id,
    lastNonCompletionColumnId: target.isCompletion ? (columns.find((column) => column.id === task.columnId)?.isCompletion ? task.lastNonCompletionColumnId : task.columnId) : target.id,
    updatedAt: new Date(),
  }).where(eq(kanbanTasks.id, taskId));
  for (const order of orders) {
    if (!columns.some((column) => column.id === order.columnId)) throw new Error("Column not found.");
    for (const [position, id] of order.taskIds.entries()) await db.update(kanbanTasks).set({ position, columnId: order.columnId }).where(and(eq(kanbanTasks.id, id), eq(kanbanTasks.boardId, boardId)));
  }
  if (task.calendarItemId) await db.update(calendarItems).set({ isCompleted: target.isCompletion, updatedAt: new Date() }).where(and(eq(calendarItems.id, task.calendarItemId), eq(calendarItems.userId, user.id)));
  refreshKanban();
}
