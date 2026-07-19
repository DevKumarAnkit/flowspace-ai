import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { kanbanBoardMembers, kanbanBoards, users, type User } from "@/db/schema";
import { revokeKanbanRoomUser, syncKanbanRoom } from "@/lib/liveblocks-server";
import { isValidCollaboratorEmail, normalizeCollaboratorEmail } from "@/lib/liveblocks-shared";

export function normalizeEmail(email: string) {
  return normalizeCollaboratorEmail(email);
}

export function assertInviteEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!isValidCollaboratorEmail(normalized)) throw new Error("Enter a valid email address.");
  return normalized;
}

export async function claimPendingKanbanInvites(user: User) {
  const email = normalizeEmail(user.email);
  const pending = await db.select({ id: kanbanBoardMembers.id, boardId: kanbanBoardMembers.boardId })
    .from(kanbanBoardMembers)
    .where(and(eq(kanbanBoardMembers.email, email), isNull(kanbanBoardMembers.userId)));
  if (!pending.length) return;
  await db.update(kanbanBoardMembers).set({ userId: user.id, updatedAt: new Date() })
    .where(and(eq(kanbanBoardMembers.email, email), isNull(kanbanBoardMembers.userId)));
  await Promise.all(pending.map(({ boardId }) => syncKanbanRoom(boardId)));
}

export async function accessibleBoardIds(user: User) {
  await claimPendingKanbanInvites(user);
  const memberships = await db.select({ boardId: kanbanBoardMembers.boardId }).from(kanbanBoardMembers).where(eq(kanbanBoardMembers.userId, user.id));
  return memberships.map(({ boardId }) => boardId);
}

export async function requireKanbanBoardAccess(user: User, boardId: number) {
  await claimPendingKanbanInvites(user);
  const [board] = await db.select().from(kanbanBoards).where(eq(kanbanBoards.id, boardId)).limit(1);
  if (!board) throw new Error("Board not found.");
  if (board.userId === user.id) return { board, role: "owner" as const };
  const [member] = await db.select().from(kanbanBoardMembers)
    .where(and(eq(kanbanBoardMembers.boardId, boardId), eq(kanbanBoardMembers.userId, user.id))).limit(1);
  if (!member) throw new Error("Board not found.");
  return { board, role: "editor" as const };
}

export async function requireKanbanBoardOwner(user: User, boardId: number) {
  const access = await requireKanbanBoardAccess(user, boardId);
  if (access.role !== "owner") throw new Error("Only the board owner can manage sharing or delete this board.");
  return access.board;
}

export async function removeKanbanMembership(user: User, boardId: number, memberId: number) {
  await requireKanbanBoardOwner(user, boardId);
  const [member] = await db.select().from(kanbanBoardMembers)
    .where(and(eq(kanbanBoardMembers.id, memberId), eq(kanbanBoardMembers.boardId, boardId))).limit(1);
  if (!member) throw new Error("Collaborator not found.");
  if (member.userId != null) await revokeKanbanRoomUser(boardId, member.userId);
  await db.delete(kanbanBoardMembers).where(eq(kanbanBoardMembers.id, member.id));
}
