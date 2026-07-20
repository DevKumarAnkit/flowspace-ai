import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { spaceMembers, spaces, type User } from "@/db/schema";
import { isValidCollaboratorEmail, normalizeCollaboratorEmail } from "@/lib/liveblocks-shared";

export function assertSpaceInviteEmail(email: string) {
  const normalized = normalizeCollaboratorEmail(email);
  if (!isValidCollaboratorEmail(normalized)) throw new Error("Enter a valid email address.");
  return normalized;
}

export async function claimPendingSpaceInvites(user: User) {
  const email = normalizeCollaboratorEmail(user.email);
  await db.update(spaceMembers).set({ userId: user.id, updatedAt: new Date() })
    .where(and(eq(spaceMembers.email, email), isNull(spaceMembers.userId)));
}

export async function accessibleSpaceIds(user: User) {
  await claimPendingSpaceInvites(user);
  const rows = await db.select({ spaceId: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, user.id));
  return rows.map((row) => row.spaceId);
}

export async function requireSpaceAccess(user: User, spaceId: number) {
  await claimPendingSpaceInvites(user);
  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  if (!space) throw new Error("Space not found.");
  if (space.userId === user.id) return { space, role: "owner" as const };
  const [member] = await db.select().from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, user.id))).limit(1);
  if (!member) throw new Error("Space not found.");
  return { space, role: "editor" as const };
}

export async function requireSpaceOwner(user: User, spaceId: number) {
  const access = await requireSpaceAccess(user, spaceId);
  if (access.role !== "owner") throw new Error("Only the space owner can manage sharing or delete this space.");
  return access.space;
}
