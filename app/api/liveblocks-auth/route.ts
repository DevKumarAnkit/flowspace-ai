import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireKanbanBoardAccess } from "@/lib/kanban-access";
import { getLiveblocks, liveblocksUserInfo } from "@/lib/liveblocks-server";
import { liveblocksUserId } from "@/lib/liveblocks-shared";
import { requireDatabaseUser } from "@/lib/require-database-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return Response.json({ error: "You must be signed in to collaborate." }, { status: 401 });
    const payload = await request.json().catch(() => ({})) as { room?: unknown };
    if (typeof payload.room !== "string") return Response.json({ error: "A Liveblocks room is required." }, { status: 400 });
    const match = /^flowspace:kanban-board:(\d+)$/.exec(payload.room);
    if (!match) return Response.json({ error: "That collaboration room is not supported." }, { status: 403 });
    const [storedUser] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
    const user = storedUser ?? await requireDatabaseUser("collaboration");
    await requireKanbanBoardAccess(user, Number(match[1]));
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
