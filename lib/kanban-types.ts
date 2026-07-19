export type KanbanPriority = "low" | "medium" | "high";

export type KanbanLabel = {
  id: number;
  boardId: number;
  name: string;
  color: string;
};

export type KanbanTask = {
  id: number;
  boardId: number;
  columnId: number;
  title: string;
  description: string;
  dueDate: string;
  priority: KanbanPriority;
  position: number;
  notesLinked: boolean;
  calendarItemId: number | null;
  lastNonCompletionColumnId: number | null;
  labels: KanbanLabel[];
};

export type KanbanColumn = {
  id: number;
  boardId: number;
  name: string;
  position: number;
  isCompletion: boolean;
  tasks: KanbanTask[];
};

export type KanbanBoard = {
  id: number;
  name: string;
  color: string;
  position: number;
  columns: KanbanColumn[];
  labels: KanbanLabel[];
  accessRole: "owner" | "editor";
};

export type KanbanData = { boards: KanbanBoard[] };

export type KanbanCollaborator = {
  id: string;
  userId: number | null;
  name: string | null;
  email: string;
  imageUrl: string | null;
  role: "owner" | "editor";
  status: "active" | "pending";
};

export type KanbanTaskInput = {
  id?: number;
  boardId: number;
  columnId: number;
  title: string;
  description: string;
  dueDate: string;
  priority: KanbanPriority;
  notesLinked: boolean;
  calendarSync: boolean;
  labelIds: number[];
  timeZone: string;
};

export const KANBAN_COLORS = [
  "#7057E8",
  "#3979CA",
  "#359568",
  "#C37719",
  "#CE6542",
  "#D44F82",
  "#168C9B",
] as const;

export const KANBAN_PRIORITIES: KanbanPriority[] = ["low", "medium", "high"];

export function todayLocal(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
