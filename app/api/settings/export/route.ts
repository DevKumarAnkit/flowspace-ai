import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { calendarCategories, calendarItemExceptions, calendarItems, generatedApps, kanbanBoards, kanbanColumns, kanbanLabels, kanbanTaskLabels, kanbanTasks, notes, spacePages, spaces, userSettings, whiteboards } from "@/db/schema";
import { requireDatabaseUser } from "@/lib/require-database-user";

export async function GET() {
  try {
    const user = await requireDatabaseUser("data export");
    const [settings, categories, calendar, boards, noteRows, spaceRows, whiteboardRows, apps] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.userId, user.id)),
      db.select().from(calendarCategories).where(eq(calendarCategories.userId, user.id)),
      db.select().from(calendarItems).where(eq(calendarItems.userId, user.id)),
      db.select().from(kanbanBoards).where(eq(kanbanBoards.userId, user.id)),
      db.select().from(notes).where(eq(notes.userId, user.id)),
      db.select().from(spaces).where(eq(spaces.userId, user.id)),
      db.select().from(whiteboards).where(eq(whiteboards.userId, user.id)),
      db.select().from(generatedApps).where(eq(generatedApps.userId, user.id)),
    ]);
    const boardIds = boards.map((row) => row.id);
    const spaceIds = spaceRows.map((row) => row.id);
    const calendarIds = calendar.map((row) => row.id);
    const [columns, labels, tasks, pages, exceptions] = await Promise.all([
      boardIds.length ? db.select().from(kanbanColumns).where(inArray(kanbanColumns.boardId, boardIds)) : [],
      boardIds.length ? db.select().from(kanbanLabels).where(inArray(kanbanLabels.boardId, boardIds)) : [],
      boardIds.length ? db.select().from(kanbanTasks).where(inArray(kanbanTasks.boardId, boardIds)) : [],
      spaceIds.length ? db.select().from(spacePages).where(inArray(spacePages.spaceId, spaceIds)) : [],
      calendarIds.length ? db.select().from(calendarItemExceptions).where(inArray(calendarItemExceptions.itemId, calendarIds)) : [],
    ]);
    const taskIds = tasks.map((row) => row.id);
    const taskLabels = taskIds.length ? await db.select().from(kanbanTaskLabels).where(inArray(kanbanTaskLabels.taskId, taskIds)) : [];
    const payload = { exportedAt: new Date().toISOString(), account: { name: user.name, email: user.email }, settings, categories, calendar: { items: calendar, exceptions }, kanban: { boards, columns, labels, tasks, taskLabels }, notes: noteRows, spaces: { spaces: spaceRows, pages }, whiteboards: whiteboardRows, generatedApps: apps };
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="flowspace-export-${date}.json"`, "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "You must be signed in to export data." }, { status: 401 });
  }
}
