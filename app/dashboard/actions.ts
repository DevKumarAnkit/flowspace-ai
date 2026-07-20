"use server";

import { asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  assistantActionRequests,
  assistantConversations,
  calendarCategories,
  calendarItems,
  generatedApps,
  kanbanBoards,
  kanbanColumns,
  kanbanTasks,
  notes,
  userSettings,
  whiteboards,
} from "@/db/schema";
import { accessibleBoardIds } from "@/lib/kanban-access";
import { requireDatabaseUser } from "@/lib/require-database-user";

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

function appName(definition: Record<string, unknown>) {
  return typeof definition.appName === "string" ? definition.appName : "AI template";
}

function activityTime(value: Date) {
  return value.toISOString();
}

export async function getDashboardData() {
  const user = await requireDatabaseUser("the dashboard");
  const sharedBoardIds = await accessibleBoardIds(user);
  const boardFilter = sharedBoardIds.length
    ? or(eq(kanbanBoards.userId, user.id), inArray(kanbanBoards.id, sharedBoardIds))
    : eq(kanbanBoards.userId, user.id);

  const [categories, calendar, boards, notesRows, whiteboardsRows, apps, conversations, assistantActions, settings] = await Promise.all([
    db.select().from(calendarCategories).where(eq(calendarCategories.userId, user.id)),
    db.select().from(calendarItems).where(eq(calendarItems.userId, user.id)).orderBy(asc(calendarItems.startDate), asc(calendarItems.startsAt)),
    db.select().from(kanbanBoards).where(boardFilter).orderBy(desc(kanbanBoards.updatedAt)),
    db.select().from(notes).where(eq(notes.userId, user.id)).orderBy(desc(notes.updatedAt)),
    db.select().from(whiteboards).where(eq(whiteboards.userId, user.id)).orderBy(desc(whiteboards.updatedAt)),
    db.select().from(generatedApps).where(eq(generatedApps.userId, user.id)).orderBy(desc(generatedApps.updatedAt)),
    db.select().from(assistantConversations).where(eq(assistantConversations.userId, user.id)).orderBy(desc(assistantConversations.updatedAt)),
    db.select().from(assistantActionRequests).where(eq(assistantActionRequests.userId, user.id)).orderBy(desc(assistantActionRequests.createdAt)),
    db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1),
  ]);

  const boardIds = boards.map((board) => board.id);
  const [columns, tasks] = boardIds.length
    ? await Promise.all([
        db.select().from(kanbanColumns).where(inArray(kanbanColumns.boardId, boardIds)),
        db.select().from(kanbanTasks).where(inArray(kanbanTasks.boardId, boardIds)).orderBy(asc(kanbanTasks.dueDate)),
      ])
    : [[], []];
  const completionColumns = new Set(columns.filter((column) => column.isCompletion).map((column) => column.id));
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const completedTasks = tasks.filter((task) => completionColumns.has(task.columnId));
  const pendingTasks = tasks.filter((task) => !completionColumns.has(task.columnId));
  const overdueTasks = pendingTasks.filter((task) => task.dueDate < todayKey);
  const completionPercent = tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  const upcoming = calendar.filter((item) => !item.isCompleted && (item.startDate ?? "9999-12-31") >= todayKey).slice(0, 6);
  const todayReminders = calendar.filter((item) => item.type === "reminder" && item.startDate === todayKey && !item.isCompleted).length;

  const activity = [
    ...tasks.map((task) => ({ id: `task-${task.id}`, title: task.title, label: "Updated task", href: "/kanban", at: task.updatedAt, tone: "amber" })),
    ...notesRows.filter((note) => !note.trashedAt).map((note) => ({ id: `note-${note.id}`, title: note.title, label: "Updated note", href: `/notes?note=${note.id}`, at: note.updatedAt, tone: "green" })),
    ...calendar.map((item) => ({ id: `calendar-${item.id}`, title: item.title, label: `Added calendar ${item.type}`, href: "/calendar", at: item.updatedAt, tone: "blue" })),
    ...whiteboardsRows.map((board) => ({ id: `whiteboard-${board.id}`, title: board.name, label: "Updated whiteboard", href: `/whiteboard?board=${board.id}`, at: board.updatedAt, tone: "cyan" })),
    ...apps.map((app) => ({ id: `app-${app.id}`, title: appName(app.definition), label: "Generated AI template", href: `/ai-template-builder/${app.id}`, at: app.updatedAt, tone: "pink" })),
    ...assistantActions.filter((action) => action.status === "completed").map((action) => ({ id: `assistant-${action.id}`, title: action.summary, label: "AI assistant action", href: "/assistant", at: action.completedAt ?? action.createdAt, tone: "rose" })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8).map((entry) => ({ ...entry, at: activityTime(entry.at) }));

  const featureStats = [
    { key: "calendar", name: "Calendar", icon: "calendar", href: "/calendar", color: "blue", stat: `${calendar.length} events`, detail: `${upcoming.length} upcoming` },
    { key: "tasks", name: "Tasks & Kanban", icon: "kanban", href: "/kanban", color: "amber", stat: `${tasks.length} tasks`, detail: `${completedTasks.length} completed` },
    { key: "notes", name: "Notes", icon: "notes", href: "/notes", color: "green", stat: `${notesRows.filter((note) => !note.trashedAt).length} notes`, detail: `${notesRows.filter((note) => note.isPinned).length} pinned` },
    { key: "whiteboard", name: "Whiteboard", icon: "whiteboard", href: "/whiteboard", color: "cyan", stat: `${whiteboardsRows.length} boards`, detail: "Visual workspace" },
    { key: "assistant", name: "AI Assistant", icon: "assistant", href: "/assistant", color: "rose", stat: `${conversations.length} chats`, detail: `${assistantActions.length} actions` },
    { key: "templates", name: "AI Templates", icon: "template", href: "/ai-template-builder", color: "pink", stat: `${apps.length} templates`, detail: "Build a mini app" },
  ];

  const activeCounts = { Notes: notesRows.length, Calendar: calendar.length, "Tasks & Kanban": tasks.length, Whiteboard: whiteboardsRows.length, "AI Templates": apps.length, "AI Assistant": conversations.length };
  const mostActive = Object.entries(activeCounts).sort((a, b) => b[1] - a[1])[0];
  const weekCompleted = completedTasks.filter((task) => task.updatedAt >= weekStart).length;
  const insights = [
    overdueTasks.length ? `You have ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}.` : "You’re clear of overdue tasks—nice work.",
    mostActive?.[1] ? `Your most active workspace is ${mostActive[0]}.` : "Start creating to build your productivity rhythm.",
    tasks.length ? `You completed ${Math.round((weekCompleted / tasks.length) * 100)}% of tasks this week.` : "Create your first task to start tracking progress.",
    todayReminders ? `You have ${todayReminders} upcoming reminder${todayReminders === 1 ? "" : "s"} today.` : "No reminders are scheduled for today.",
    overdueTasks.length || pendingTasks.some((task) => task.priority === "high") ? "Suggested focus: Finish high-priority tasks first." : "Suggested focus: Keep your momentum with one small next step.",
  ];

  return {
    user: { name: user.name ?? user.email.split("@")[0], email: user.email },
    featureStats,
    featureEnabled: { assistant: settings[0]?.aiFeatures?.assistant !== false, templates: settings[0]?.aiFeatures?.templateBuilder !== false },
    quickActions: [
      { label: "Create task", detail: "Plan your next step", href: "/kanban", icon: "kanban", color: "amber" },
      { label: "Add reminder", detail: "Keep time on your side", href: "/calendar", icon: "calendar", color: "blue" },
      { label: "Create note", detail: "Capture an idea", href: "/notes", icon: "notes", color: "green" },
      { label: "Open whiteboard", detail: "Map it visually", href: "/whiteboard", icon: "whiteboard", color: "cyan" },
      { label: "Ask AI", detail: "Think it through", href: "/assistant", icon: "assistant", color: "rose" },
      { label: "Generate template", detail: "Build a mini app", href: "/ai-template-builder", icon: "template", color: "pink" },
    ],
    upcoming: upcoming.map((item) => ({ id: item.id, title: item.title, type: item.type, date: item.startDate, time: item.startsAt?.toISOString() ?? null, color: categories.find((category) => category.id === item.categoryId)?.color ?? "#7057E8" })),
    activity,
    recent: [
      ...notesRows.filter((note) => !note.trashedAt).slice(0, 3).map((note) => ({ id: `note-${note.id}`, title: note.title, type: "Note", href: `/notes?note=${note.id}`, color: note.color, at: activityTime(note.updatedAt) })),
      ...whiteboardsRows.slice(0, 3).map((board) => ({ id: `whiteboard-${board.id}`, title: board.name, type: "Whiteboard", href: `/whiteboard?board=${board.id}`, color: board.color, at: activityTime(board.updatedAt) })),
      ...boards.slice(0, 3).map((board) => ({ id: `board-${board.id}`, title: board.name, type: "Kanban board", href: `/kanban?board=${board.id}`, color: board.color, at: activityTime(board.updatedAt) })),
      ...apps.slice(0, 3).map((app) => ({ id: `app-${app.id}`, title: appName(app.definition), type: "AI template", href: `/ai-template-builder/${app.id}`, color: "#d44f82", at: activityTime(app.updatedAt) })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8),
    taskSummary: { total: tasks.length, completed: completedTasks.length, pending: pendingTasks.length, overdue: overdueTasks.length, percent: completionPercent },
    insights,
    todayCount: calendar.filter((item) => item.startDate === todayKey && !item.isCompleted).length,
  };
}
