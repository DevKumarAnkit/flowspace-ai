"use server";

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { calendarCategories, notes } from "@/db/schema";
import {
  cleanNoteTitle,
  duplicateTitle,
  EMPTY_NOTE_DOCUMENT,
  type Note,
  type NoteColor,
  type NoteIcon,
  type TiptapDocument,
  validDocument,
  validNoteColor,
  validNoteIcon,
} from "@/lib/notes-domain";
import { requireDatabaseUser } from "@/lib/require-database-user";

function serializeNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    categoryId: row.categoryId,
    title: row.title,
    content: row.content as TiptapDocument,
    color: row.color as NoteColor,
    icon: row.icon as NoteIcon,
    isPinned: row.isPinned,
    trashedAt: row.trashedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ownedNote(id: number, userId: number) {
  const [note] = await db.select().from(notes).where(and(eq(notes.id, id), eq(notes.userId, userId))).limit(1);
  if (!note) throw new Error("Note not found.");
  return note;
}

function refreshNotes() {
  revalidatePath("/notes");
}

export async function getNotesData() {
  const user = await requireDatabaseUser("notes");
  const rows = await db.select().from(notes).where(eq(notes.userId, user.id)).orderBy(desc(notes.updatedAt));
  return rows.map(serializeNote);
}

export async function createNoteAction() {
  const user = await requireDatabaseUser("notes");
  const [row] = await db.insert(notes).values({
    userId: user.id,
    title: "Untitled Note",
    content: EMPTY_NOTE_DOCUMENT,
    color: "#7057E8",
    icon: "file",
  }).returning();
  refreshNotes();
  return serializeNote(row);
}

export async function saveNoteAction(id: number, update: { title?: string; content?: TiptapDocument }) {
  const user = await requireDatabaseUser("notes");
  const current = await ownedNote(id, user.id);
  if (current.trashedAt) throw new Error("Restore this note before editing it.");
  const values: { title?: string; content?: Record<string, unknown>; updatedAt: Date } = { updatedAt: new Date() };
  if (update.title !== undefined) values.title = cleanNoteTitle(update.title);
  if (update.content !== undefined) values.content = validDocument(update.content);
  const [row] = await db.update(notes).set(values).where(and(eq(notes.id, id), eq(notes.userId, user.id), isNull(notes.trashedAt))).returning();
  if (!row) throw new Error("Note not found.");
  refreshNotes();
  return serializeNote(row);
}

export async function renameNoteAction(id: number, title: string) {
  return saveNoteAction(id, { title });
}

export async function duplicateNoteAction(id: number) {
  const user = await requireDatabaseUser("notes");
  const source = await ownedNote(id, user.id);
  if (source.trashedAt) throw new Error("Restore this note before duplicating it.");
  const [row] = await db.insert(notes).values({
    userId: user.id,
    title: duplicateTitle(source.title),
    content: source.content,
    color: source.color,
    icon: source.icon,
    isPinned: false,
  }).returning();
  refreshNotes();
  return serializeNote(row);
}

export async function setNoteColorAction(id: number, color: string) {
  const user = await requireDatabaseUser("notes");
  await ownedNote(id, user.id);
  const [row] = await db.update(notes).set({ color: validNoteColor(color), updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, user.id), isNull(notes.trashedAt))).returning();
  if (!row) throw new Error("Restore this note before changing its color.");
  refreshNotes();
  return serializeNote(row);
}

export async function setNoteIconAction(id: number, icon: string) {
  const user = await requireDatabaseUser("notes");
  await ownedNote(id, user.id);
  const [row] = await db.update(notes).set({ icon: validNoteIcon(icon), updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, user.id), isNull(notes.trashedAt))).returning();
  if (!row) throw new Error("Restore this note before changing its icon.");
  refreshNotes();
  return serializeNote(row);
}

export async function setNoteCategoryAction(id: number, categoryId: number | null) {
  const user = await requireDatabaseUser("notes");
  await ownedNote(id, user.id);
  if (categoryId !== null) {
    const [category] = await db.select({ id: calendarCategories.id }).from(calendarCategories).where(and(eq(calendarCategories.id, categoryId), eq(calendarCategories.userId, user.id), eq(calendarCategories.scope, "note"))).limit(1);
    if (!category) throw new Error("That note category is not available.");
  }
  const [row] = await db.update(notes).set({ categoryId, updatedAt: new Date() }).where(and(eq(notes.id, id), eq(notes.userId, user.id), isNull(notes.trashedAt))).returning();
  if (!row) throw new Error("Restore this note before changing its category.");
  refreshNotes();
  return serializeNote(row);
}

export async function setNotePinnedAction(id: number, isPinned: boolean) {
  const user = await requireDatabaseUser("notes");
  await ownedNote(id, user.id);
  const [row] = await db.update(notes).set({ isPinned, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, user.id), isNull(notes.trashedAt))).returning();
  if (!row) throw new Error("Restore this note before pinning it.");
  refreshNotes();
  return serializeNote(row);
}

export async function trashNoteAction(id: number) {
  const user = await requireDatabaseUser("notes");
  await ownedNote(id, user.id);
  const [row] = await db.update(notes).set({ trashedAt: new Date(), isPinned: false, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, user.id), isNull(notes.trashedAt))).returning();
  if (!row) throw new Error("Note not found.");
  refreshNotes();
  return serializeNote(row);
}

export async function restoreNoteAction(id: number) {
  const user = await requireDatabaseUser("notes");
  await ownedNote(id, user.id);
  const [row] = await db.update(notes).set({ trashedAt: null, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, user.id), isNotNull(notes.trashedAt))).returning();
  if (!row) throw new Error("Note not found in Trash.");
  refreshNotes();
  return serializeNote(row);
}

export async function permanentlyDeleteNoteAction(id: number) {
  const user = await requireDatabaseUser("notes");
  const [row] = await db.delete(notes).where(and(eq(notes.id, id), eq(notes.userId, user.id), isNotNull(notes.trashedAt))).returning({ id: notes.id });
  if (!row) throw new Error("Only notes in Trash can be permanently deleted.");
  refreshNotes();
}
