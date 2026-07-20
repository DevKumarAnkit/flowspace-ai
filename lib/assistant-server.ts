import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assistantActionRequests, assistantConversations, assistantMessages } from "@/db/schema";
import { createKanbanBoardAction, getKanbanData, saveKanbanTaskAction } from "@/app/kanban/actions";
import { saveCalendarItemAction } from "@/app/calendar/actions";
import { createNoteAction, saveNoteAction } from "@/app/notes/actions";
import { createWhiteboardAction, renameWhiteboardAction } from "@/app/whiteboard/actions";
import { updateSettingsAction } from "@/app/settings/actions";
import { createGeneratedAppFallback, initialGeneratedAppState, validateGeneratedAppPrompt } from "@/lib/generated-app-domain";
import { generatedApps } from "@/db/schema";
import { requireDatabaseUser } from "@/lib/require-database-user";
import { validateAssistantAction, type AssistantAction } from "@/lib/assistant-domain";

type MessageRole = "user" | "assistant";
export type AssistantConversation = { id: number; title: string; messages: Array<{ id: number; role: MessageRole; content: string; createdAt: string }>; actions: Array<{ id: number; type: string; summary: string; status: string; result: Record<string, unknown> | null }> };

export async function getAssistantConversation(id?: number): Promise<AssistantConversation | null> {
  const user = await requireDatabaseUser("AI Assistant");
  const rows = await db.select().from(assistantConversations).where(eq(assistantConversations.userId, user.id)).orderBy(desc(assistantConversations.updatedAt));
  const conversation = id ? rows.find((row) => row.id === id) : rows[0];
  if (!conversation) return null;
  const [messages, actions] = await Promise.all([
    db.select().from(assistantMessages).where(eq(assistantMessages.conversationId, conversation.id)).orderBy(asc(assistantMessages.createdAt)),
    db.select().from(assistantActionRequests).where(and(eq(assistantActionRequests.conversationId, conversation.id), eq(assistantActionRequests.userId, user.id))).orderBy(asc(assistantActionRequests.createdAt)),
  ]);
  return { id: conversation.id, title: conversation.title, messages: messages.map((message) => ({ id: message.id, role: message.role as MessageRole, content: message.content, createdAt: message.createdAt.toISOString() })), actions: actions.map((action) => ({ id: action.id, type: action.type, summary: action.summary, status: action.status, result: action.result ?? null })) };
}

export async function appendAssistantMessage(conversationId: number, role: MessageRole, content: string) {
  const user = await requireDatabaseUser("AI Assistant");
  const [conversation] = await db.select().from(assistantConversations).where(and(eq(assistantConversations.id, conversationId), eq(assistantConversations.userId, user.id))).limit(1);
  if (!conversation) throw new Error("Conversation not found.");
  const [message] = await db.insert(assistantMessages).values({ conversationId, role, content }).returning();
  await db.update(assistantConversations).set({ title: conversation.title === "New conversation" && role === "user" ? content.slice(0, 60) : conversation.title, updatedAt: new Date() }).where(eq(assistantConversations.id, conversationId));
  return { id: message.id, role, content, createdAt: message.createdAt.toISOString() };
}

export async function createAssistantConversation() {
  const user = await requireDatabaseUser("AI Assistant");
  const [conversation] = await db.insert(assistantConversations).values({ userId: user.id }).returning();
  return { id: conversation.id, title: conversation.title, messages: [], actions: [] } satisfies AssistantConversation;
}

export async function createAssistantAction(conversationId: number, input: AssistantAction) {
  const user = await requireDatabaseUser("AI Assistant");
  const action = validateAssistantAction(input);
  const [conversation] = await db.select({ id: assistantConversations.id }).from(assistantConversations).where(and(eq(assistantConversations.id, conversationId), eq(assistantConversations.userId, user.id))).limit(1);
  if (!conversation) throw new Error("Conversation not found.");
  const [row] = await db.insert(assistantActionRequests).values({ conversationId, userId: user.id, ...action }).returning();
  return { id: row.id, type: row.type, summary: row.summary, status: row.status, result: null };
}

function stringValue(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
function dateValue(value: unknown) {
  const raw = stringValue(value).toLowerCase();
  const today = new Date();
  if (raw === "tomorrow") { today.setDate(today.getDate() + 1); return today.toISOString().slice(0, 10); }
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today.toISOString().slice(0, 10);
}
function reminderTime(value: unknown) {
  const raw = stringValue(value).toUpperCase();
  const matched = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!matched) return null;
  let hour = Number(matched[1]); const minutes = Number(matched[2] ?? 0); const period = matched[3];
  if (minutes > 59 || hour > 23 || hour < 0 || (period && hour > 12)) return null;
  if (period === "PM" && hour < 12) hour += 12; if (period === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function executeAction(action: AssistantAction, userId: number) {
  const payload = action.payload;
  if (action.type === "create_board") {
    const board = await createKanbanBoardAction(stringValue(payload.name, "New board"), stringValue(payload.color, "#7057E8"));
    return { message: `Created the ${board.name} board.`, href: `/kanban?board=${board.id}` };
  }
  if (action.type === "create_task") {
    const data = await getKanbanData();
    const board = data.boards.find((entry) => entry.id === Number(payload.boardId)) ?? data.boards[0];
    if (!board) throw new Error("Create a Kanban board before adding a task.");
    const column = board.columns.find((entry) => !entry.isCompletion) ?? board.columns[0];
    if (!column) throw new Error("This board has no available column.");
    await saveKanbanTaskAction({ boardId: board.id, columnId: column.id, title: stringValue(payload.title, "Untitled task"), description: stringValue(payload.description), dueDate: dateValue(payload.dueDate), priority: ["low", "medium", "high"].includes(stringValue(payload.priority)) ? stringValue(payload.priority) as "low" | "medium" | "high" : "medium", categoryId: null, notesLinked: false, calendarSync: Boolean(payload.calendarSync), labelIds: [], timeZone: stringValue(payload.timeZone, "UTC") });
    return { message: `Added the task to ${board.name}.`, href: `/kanban?board=${board.id}` };
  }
  if (action.type === "create_reminder") {
    const date = dateValue(payload.date);
    const time = reminderTime(payload.time);
    const offset = [0, 5, 10, 30, 1440].includes(Number(payload.notificationOffset)) ? Number(payload.notificationOffset) : 10;
    const startsAt = time ? `${date}T${time}:00` : null;
    const startHour = time ? Number(time.slice(0, 2)) : 0;
    const endDate = startHour === 23 ? (() => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + 1); return next.toISOString().slice(0, 10); })() : date;
    const endsAt = time ? `${endDate}T${String((startHour + 1) % 24).padStart(2, "0")}:${time.slice(3)}:00` : null;
    await saveCalendarItemAction({ type: "reminder", title: stringValue(payload.title, "Reminder"), description: stringValue(payload.description), categoryId: null, isDraft: false, isCompleted: false, allDay: !time, startDate: time ? null : date, endDate: time ? null : date, startsAt, endsAt, timeZone: stringValue(payload.timeZone, "UTC"), notificationOffset: offset, recurrenceFrequency: "none", recurrenceEndMode: "never", recurrenceEndDate: null, recurrenceCount: null });
    return { message: "Added the reminder to your calendar.", href: "/calendar" };
  }
  if (action.type === "create_note") {
    const note = await createNoteAction();
    const saved = await saveNoteAction(note.id, { title: stringValue(payload.title, "Untitled Note") });
    return { message: `Created ${saved.title}.`, href: `/notes?note=${saved.id}` };
  }
  if (action.type === "create_whiteboard") {
    const board = await createWhiteboardAction();
    const saved = await renameWhiteboardAction(board.id, stringValue(payload.name, "Untitled Whiteboard"));
    return { message: `Created the ${saved.name} whiteboard.`, href: `/whiteboard?board=${saved.id}` };
  }
  if (action.type === "generate_template") {
    const prompt = validateGeneratedAppPrompt({ prompt: stringValue(payload.prompt, action.summary) });
    const definition = createGeneratedAppFallback(prompt);
    const [app] = await db.insert(generatedApps).values({ userId, prompt, definition, state: initialGeneratedAppState(definition) }).returning();
    return { message: `Created your ${definition.appName} template.`, href: `/ai-template-builder/${app.id}` };
  }
  if (action.type === "update_settings") {
    await updateSettingsAction(payload);
    return { message: "Updated your settings.", href: "/settings" };
  }
  throw new Error("This action is not supported.");
}

export async function confirmAssistantAction(id: number) {
  const user = await requireDatabaseUser("AI Assistant");
  const [row] = await db.select().from(assistantActionRequests).where(and(eq(assistantActionRequests.id, id), eq(assistantActionRequests.userId, user.id))).limit(1);
  if (!row) throw new Error("Action request not found.");
  if (row.status !== "pending") throw new Error("This action has already been handled.");
  const action = validateAssistantAction({ type: row.type, summary: row.summary, payload: row.payload });
  try {
    const result = await executeAction(action, user.id);
    await db.update(assistantActionRequests).set({ status: "completed", result, completedAt: new Date() }).where(eq(assistantActionRequests.id, id));
    await appendAssistantMessage(row.conversationId, "assistant", result.message);
    return result;
  } catch (error) {
    await db.update(assistantActionRequests).set({ status: "failed", result: { message: error instanceof Error ? error.message : "Unable to complete action." }, completedAt: new Date() }).where(eq(assistantActionRequests.id, id));
    throw error;
  }
}
