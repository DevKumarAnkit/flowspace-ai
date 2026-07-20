"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { generatedApps } from "@/db/schema";
import { requireDatabaseUser } from "@/lib/require-database-user";
import {
  type GeneratedApp,
  validGeneratedAppId,
  validateGeneratedAppDefinition,
  validateGeneratedAppState,
} from "@/lib/generated-app-domain";

function serialize(row: typeof generatedApps.$inferSelect): GeneratedApp {
  const definition = validateGeneratedAppDefinition(row.definition);
  return {
    id: row.id,
    prompt: row.prompt,
    definition,
    state: validateGeneratedAppState(row.state, definition),
    sidebarPosition: row.sidebarPosition,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function refresh(id?: number) {
  revalidatePath("/");
  revalidatePath("/ai-template-builder");
  if (id) revalidatePath(`/ai-template-builder/${id}`);
}

async function ownedApp(idValue: string | number, userId: number) {
  const id = validGeneratedAppId(idValue);
  const [row] = await db.select().from(generatedApps).where(and(eq(generatedApps.id, id), eq(generatedApps.userId, userId))).limit(1);
  if (!row) throw new Error("App not found.");
  return row;
}

export async function getGeneratedAppsAction() {
  const user = await requireDatabaseUser("AI Template Builder");
  const rows = await db.select().from(generatedApps).where(eq(generatedApps.userId, user.id)).orderBy(desc(generatedApps.createdAt));
  return rows.map(serialize);
}

export async function getGeneratedAppAction(id: string | number) {
  const user = await requireDatabaseUser("AI Template Builder");
  return serialize(await ownedApp(id, user.id));
}

export async function getPinnedGeneratedAppsAction() {
  const user = await requireDatabaseUser("AI Template Builder");
  const rows = await db.select().from(generatedApps).where(and(eq(generatedApps.userId, user.id))).orderBy(asc(generatedApps.sidebarPosition));
  return rows.filter((row) => row.sidebarPosition !== null).map(serialize);
}

export async function saveGeneratedAppStateAction(idValue: string | number, value: unknown) {
  const user = await requireDatabaseUser("AI Template Builder");
  const existing = await ownedApp(idValue, user.id);
  const definition = validateGeneratedAppDefinition(existing.definition);
  const state = validateGeneratedAppState(value, definition);
  const [row] = await db.update(generatedApps).set({ state, updatedAt: new Date() }).where(and(eq(generatedApps.id, existing.id), eq(generatedApps.userId, user.id))).returning();
  if (!row) throw new Error("App not found.");
  revalidatePath(`/ai-template-builder/${existing.id}`);
  return serialize(row);
}

export async function addGeneratedAppToSidebarAction(idValue: string | number) {
  const user = await requireDatabaseUser("AI Template Builder");
  const existing = await ownedApp(idValue, user.id);
  if (existing.sidebarPosition !== null) return serialize(existing);
  const pinned = await db.select({ position: generatedApps.sidebarPosition }).from(generatedApps).where(eq(generatedApps.userId, user.id));
  const used = new Set(pinned.map((item) => item.position).filter((position): position is number => position !== null));
  const position = [0, 1, 2].find((candidate) => !used.has(candidate));
  if (position === undefined) throw new Error("You can add up to 3 generated apps to the sidebar.");
  try {
    const [row] = await db.update(generatedApps).set({ sidebarPosition: position, updatedAt: new Date() }).where(and(eq(generatedApps.id, existing.id), eq(generatedApps.userId, user.id))).returning();
    if (!row) throw new Error("App not found.");
    refresh(existing.id);
    return serialize(row);
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) throw new Error("The sidebar changed while this app was being added. Please try again.");
    throw error;
  }
}

export async function removeGeneratedAppFromSidebarAction(idValue: string | number) {
  const user = await requireDatabaseUser("AI Template Builder");
  const existing = await ownedApp(idValue, user.id);
  const [row] = await db.update(generatedApps).set({ sidebarPosition: null, updatedAt: new Date() }).where(and(eq(generatedApps.id, existing.id), eq(generatedApps.userId, user.id))).returning();
  if (!row) throw new Error("App not found.");
  refresh(existing.id);
  return serialize(row);
}

export async function deleteGeneratedAppAction(idValue: string | number) {
  const user = await requireDatabaseUser("AI Template Builder");
  const id = validGeneratedAppId(idValue);
  const [deleted] = await db.delete(generatedApps).where(and(eq(generatedApps.id, id), eq(generatedApps.userId, user.id))).returning({ id: generatedApps.id });
  if (!deleted) throw new Error("App not found.");
  refresh(id);
  return deleted.id;
}
