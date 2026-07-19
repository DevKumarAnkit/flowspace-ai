"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { whiteboards } from "@/db/schema";
import { cleanWhiteboardName, EMPTY_WHITEBOARD_SCENE, validWhiteboardColor, validWhiteboardScene, type Whiteboard } from "@/lib/whiteboard-domain";
import { requireDatabaseUser } from "@/lib/require-database-user";

function serialize(row: typeof whiteboards.$inferSelect): Whiteboard {
  return { id: row.id, name: row.name, color: validWhiteboardColor(row.color), scene: validWhiteboardScene(row.scene), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

async function ownedBoard(id: number, userId: number) {
  const [board] = await db.select().from(whiteboards).where(and(eq(whiteboards.id, id), eq(whiteboards.userId, userId))).limit(1);
  if (!board) throw new Error("Whiteboard not found.");
  return board;
}

function refresh() { revalidatePath("/whiteboard"); }

export async function getWhiteboardsAction() {
  const user = await requireDatabaseUser("whiteboards");
  const rows = await db.select().from(whiteboards).where(eq(whiteboards.userId, user.id)).orderBy(desc(whiteboards.updatedAt));
  return rows.map(serialize);
}

export async function createWhiteboardAction() {
  const user = await requireDatabaseUser("whiteboards");
  const count = await db.select({ id: whiteboards.id }).from(whiteboards).where(eq(whiteboards.userId, user.id));
  const [row] = await db.insert(whiteboards).values({ userId: user.id, name: "Untitled Whiteboard", color: ["#7057E8", "#3979CA", "#359568", "#C37719", "#CE6542", "#D44F82"][count.length % 6], scene: EMPTY_WHITEBOARD_SCENE }).returning();
  refresh();
  return serialize(row);
}

export async function renameWhiteboardAction(id: number, name: string) {
  const user = await requireDatabaseUser("whiteboards");
  await ownedBoard(id, user.id);
  const [row] = await db.update(whiteboards).set({ name: cleanWhiteboardName(name), updatedAt: new Date() }).where(and(eq(whiteboards.id, id), eq(whiteboards.userId, user.id))).returning();
  refresh();
  return serialize(row);
}

export async function deleteWhiteboardAction(id: number) {
  const user = await requireDatabaseUser("whiteboards");
  const [row] = await db.delete(whiteboards).where(and(eq(whiteboards.id, id), eq(whiteboards.userId, user.id))).returning({ id: whiteboards.id });
  if (!row) throw new Error("Whiteboard not found.");
  refresh();
  return row.id;
}

export async function saveWhiteboardAction(id: number, scene: unknown) {
  const user = await requireDatabaseUser("whiteboards");
  const [row] = await db.update(whiteboards).set({ scene: validWhiteboardScene(scene), updatedAt: new Date() }).where(and(eq(whiteboards.id, id), eq(whiteboards.userId, user.id))).returning();
  if (!row) throw new Error("Whiteboard not found.");
  return serialize(row);
}
