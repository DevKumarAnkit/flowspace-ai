import { auth } from "@clerk/nextjs/server";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { spaceMembers, spacePages, spaces, users } from "@/db/schema";
import { requireKanbanBoardAccess } from "@/lib/kanban-access";
import { getLiveblocks, liveblocksUserInfo } from "@/lib/liveblocks-server";
import { liveblocksUserId } from "@/lib/liveblocks-shared";
import { requireDatabaseUser } from "@/lib/require-database-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return Response.json({ error: "You must be signed in to collaborate." }, { status: 401 });
    const payload = await request.json().catch(() => ({})) as { room?: unknown };
    if (typeof payload.room !== "string") return Response.json({ error: "A Liveblocks room is required." }, { status: 400 });
    const kanbanMatch = /^flowspace:kanban-board:(\d+)$/.exec(payload.room);
    const pageMatch = /^flowspace:space-page:(\d+)$/.exec(payload.room);
    if (!kanbanMatch && !pageMatch) return Response.json({ error: "That collaboration room is not supported." }, { status: 403 });
    const [storedUser] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
    const user = storedUser ?? await requireDatabaseUser("collaboration");
    if (kanbanMatch) await requireKanbanBoardAccess(user, Number(kanbanMatch[1]));
    if (pageMatch) {
      const pageId = Number(pageMatch[1]);
      const [access] = await db.select({ pageId: spacePages.id })
        .from(spacePages)
        .innerJoin(spaces, eq(spacePages.spaceId, spaces.id))
        .leftJoin(spaceMembers, and(
          eq(spaceMembers.spaceId, spaces.id),
          or(eq(spaceMembers.userId, user.id), eq(spaceMembers.email, user.email.toLowerCase())),
        ))
        .where(and(
          eq(spacePages.id, pageId),
          or(eq(spaces.userId, user.id), isNotNull(spaceMembers.id)),
        ))
        .limit(1);
      if (!access) return Response.json({ error: "Page not found." }, { status: 403 });
    }
    const session = getLiveblocks().prepareSession(liveblocksUserId(user.id), { userInfo: liveblocksUserInfo(user) });
    session.allow(payload.room, ["*:write"]);
    const { body, status } = await session.authorize();
    return new Response(body, { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to authenticate collaboration.";
    const status = message.includes("Board not found") || message.includes("Only the board owner") ? 403 : 503;
    console.error("Liveblocks authentication failed", error);
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
