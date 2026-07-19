import type { KanbanPriority } from "./kanban-types.ts";

export const MAX_KANBAN_COLUMNS = 5;

export function cleanName(value: string, kind: string) {
  const name = value.trim();
  if (!name || name.length > 40) throw new Error(`Enter a ${kind} name up to 40 characters.`);
  return name;
}

export function validateTaskFields(titleValue: string, descriptionValue: string, dueDate: string, priority: string) {
  const title = titleValue.trim();
  const description = descriptionValue.trim();
  if (!title || title.length > 160) throw new Error("Enter a task title up to 160 characters.");
  if (description.length > 4000) throw new Error("Keep the task description under 4,000 characters.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Choose a valid due date.");
  if (!(["low", "medium", "high"] as string[]).includes(priority)) throw new Error("Choose a valid priority.");
  return { title, description, priority: priority as KanbanPriority };
}

export function assertCanAddColumn(count: number) {
  if (count >= MAX_KANBAN_COLUMNS) throw new Error("A board can have up to five columns.");
}

export function assertUniqueColumnName(name: string, columns: Array<{ id: number; name: string }>, excludeId?: number) {
  const normalized = name.trim().toLocaleLowerCase();
  if (columns.some((column) => column.id !== excludeId && column.name.trim().toLocaleLowerCase() === normalized)) {
    throw new Error("That board already has a column with this name.");
  }
}

export function nextPositions(ids: number[]) {
  return ids.map((id, position) => ({ id, position }));
}

export function restoreColumnId(
  lastColumnId: number | null,
  columns: Array<{ id: number; isCompletion: boolean; position: number }>,
) {
  const available = columns.filter((column) => !column.isCompletion).sort((a, b) => a.position - b.position);
  return available.some((column) => column.id === lastColumnId) ? lastColumnId : (available[0]?.id ?? null);
}
