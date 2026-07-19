import "server-only";

import { Liveblocks } from "@liveblocks/node";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { kanbanBoardMembers, kanbanBoards, users, type User } from "@/db/schema";
import { avatarColor, kanbanRoomId, liveblocksUserId } from "@/lib/liveblocks-shared";

let client: Liveblocks | null = null;

export function getLiveblocks() {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) throw new Error("Liveblocks is not configured. Add LIVEBLOCKS_SECRET_KEY to your environment.");
  client ??= new Liveblocks({ secret });
  return client;
}

export function liveblocksUserInfo(user: User) {
  return {
    name: user.name || user.email.split("@")[0],
    email: user.email,
    avatar: user.imageUrl || "",
    color: avatarColor(user.email),
  };
}

export async function syncKanbanRoom(boardId: number) {
  const [board] = await db.select().from(kanbanBoards).where(eq(kanbanBoards.id, boardId)).limit(1);
  if (!board) return;
  const members = await db.select({ userId: kanbanBoardMembers.userId }).from(kanbanBoardMembers)
    .where(and(eq(kanbanBoardMembers.boardId, boardId), isNotNull(kanbanBoardMembers.userId)));
  const accesses: Record<string, ["*:write"]> = { [liveblocksUserId(board.userId)]: ["*:write"] };
  for (const member of members) if (member.userId != null) accesses[liveblocksUserId(member.userId)] = ["*:write"];
  await getLiveblocks().upsertRoom(kanbanRoomId(boardId), {
    update: { defaultAccesses: [], usersAccesses: accesses, metadata: { feature: "kanban", boardId: String(boardId) } },
    create: { defaultAccesses: [], usersAccesses: accesses, metadata: { feature: "kanban", boardId: String(boardId) } },
  });
}

export async function revokeKanbanRoomUser(boardId: number, userId: number) {
  await getLiveblocks().updateRoom(kanbanRoomId(boardId), { usersAccesses: { [liveblocksUserId(userId)]: null } });
}

export async function deleteTaskThread(boardId: number, taskId: number) {
  const liveblocks = getLiveblocks();
  const { data } = await liveblocks.getThreads({ roomId: kanbanRoomId(boardId), query: { metadata: { taskId: String(taskId) } } });
  await Promise.all(data.map((thread) => liveblocks.deleteThread({ roomId: kanbanRoomId(boardId), threadId: thread.id })));
}

export async function resolveLiveblocksUsers(ids: string[]) {
  const numericIds = ids.map((id) => Number(id.replace(/^user:/, ""))).filter(Number.isInteger);
  const found = numericIds.length ? await db.select().from(users).where(inArray(users.id, numericIds)) : [];
  const byId = new Map(found.map((user) => [liveblocksUserId(user.id), user]));
  return ids.map((id) => {
    const user = byId.get(id);
    return user ? liveblocksUserInfo(user) : { name: "Former collaborator", email: "", avatar: "", color: "#706E80" };
  });
}
