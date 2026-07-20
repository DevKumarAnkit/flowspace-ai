"use server";

import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { kanbanBoards, kanbanTasks, spaceMembers, spacePages, spacePageTaskLinks, spaces, users, type User } from "@/db/schema";
import { cleanPageTitle, cleanSpaceDescription, cleanSpaceName, duplicateName, templateDocument, validPageDocument, validPageTemplate, validSpaceColor, type LinkedTask, type PageDocument, type PersonSummary, type SpaceCollaborator, type SpaceDetail, type SpacePage, type SpaceSummary } from "@/lib/spaces-domain";
import { requireDatabaseUser } from "@/lib/require-database-user";
import { accessibleSpaceIds, assertSpaceInviteEmail, requireSpaceAccess, requireSpaceOwner } from "@/lib/spaces-access";
import { accessibleBoardIds, requireKanbanBoardAccess } from "@/lib/kanban-access";

function person(row: typeof users.$inferSelect): PersonSummary {
  return { id: row.id, name: row.name?.trim() || row.email.split("@")[0], email: row.email, imageUrl: row.imageUrl };
}

function pageFromRow(row: typeof spacePages.$inferSelect, updater: PersonSummary): SpacePage {
  return {
    id: row.id, spaceId: row.spaceId, title: row.title, template: validPageTemplate(row.template),
    content: validPageDocument(row.content), isFavorite: row.isFavorite,
    archivedAt: row.archivedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(), updatedBy: updater,
  };
}

async function ownedSpace(id: number, user: User) {
  return (await requireSpaceAccess(user, id)).space;
}

async function ownedPage(id: number, user: User) {
  const [row] = await db.select({ page: spacePages, space: spaces }).from(spacePages)
    .innerJoin(spaces, eq(spacePages.spaceId, spaces.id))
    .where(eq(spacePages.id, id)).limit(1);
  if (!row) throw new Error("Page not found.");
  await requireSpaceAccess(user, row.space.id);
  return row;
}

function refresh(spaceId?: number, pageId?: number) {
  revalidatePath("/spaces");
  if (spaceId) revalidatePath(`/spaces/${spaceId}`);
  if (spaceId && pageId) revalidatePath(`/spaces/${spaceId}/pages/${pageId}`);
}

async function touchSpace(id: number) {
  await db.update(spaces).set({ updatedAt: new Date() }).where(eq(spaces.id, id));
}

export async function getSpacesData(): Promise<SpaceSummary[]> {
  const user = await requireDatabaseUser("Pages & Spaces");
  const sharedIds = await accessibleSpaceIds(user);
  const rows = await db.select().from(spaces).where(sharedIds.length ? or(eq(spaces.userId, user.id), inArray(spaces.id, sharedIds)) : eq(spaces.userId, user.id)).orderBy(desc(spaces.updatedAt));
  if (!rows.length) return [];
  const [pages, ownerRows] = await Promise.all([
    db.select({ id: spacePages.id, spaceId: spacePages.spaceId, title: spacePages.title, archivedAt: spacePages.archivedAt }).from(spacePages).where(inArray(spacePages.spaceId, rows.map((row) => row.id))),
    db.select().from(users).where(inArray(users.id, [...new Set(rows.map((row) => row.userId))])),
  ]);
  const owners = new Map(ownerRows.map((row) => [row.id, person(row)]));
  return rows.map((row) => ({
    id: row.id, name: row.name, description: row.description, color: validSpaceColor(row.color), isFavorite: row.isFavorite,
    lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null, archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    pageCount: pages.filter((page) => page.spaceId === row.id && !page.archivedAt).length,
    pageTitles: pages.filter((page) => page.spaceId === row.id).map((page) => page.title), owner: owners.get(row.userId) ?? person(user), accessRole: row.userId === user.id ? "owner" : "editor",
  }));
}

export async function getSpaceData(id: number): Promise<SpaceDetail> {
  const user = await requireDatabaseUser("Pages & Spaces");
  const access = await requireSpaceAccess(user, id);
  const row = access.space;
  const openedAt = new Date();
  await db.update(spaces).set({ lastOpenedAt: openedAt }).where(eq(spaces.id, id));
  const rows = await db.select().from(spacePages).where(eq(spacePages.spaceId, id)).orderBy(desc(spacePages.updatedAt));
  const people = await db.select().from(users).where(inArray(users.id, [...new Set([row.userId, ...rows.map((page) => page.updatedByUserId)])]));
  const peopleById = new Map(people.map((entry) => [entry.id, person(entry)]));
  const owner = peopleById.get(row.userId) ?? person(user);
  return {
    id: row.id, name: row.name, description: row.description, color: validSpaceColor(row.color), isFavorite: row.isFavorite,
    lastOpenedAt: openedAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), owner, accessRole: access.role,
    pages: rows.map((page) => pageFromRow(page, peopleById.get(page.updatedByUserId) ?? owner)),
  };
}

export async function getPageData(spaceId: number, pageId: number) {
  const space = await getSpaceData(spaceId);
  const page = space.pages.find((entry) => entry.id === pageId);
  if (!page) throw new Error("Page not found in this space.");
  const allSpaces = (await getSpacesData()).filter((entry) => !entry.archivedAt);
  return { space, page, allSpaces };
}

export async function createSpaceAction(input: { name: string; description: string; color: string }) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const [row] = await db.insert(spaces).values({ userId: user.id, name: cleanSpaceName(input.name), description: cleanSpaceDescription(input.description), color: validSpaceColor(input.color) }).returning();
  refresh(row.id);
  return row.id;
}

export async function updateSpaceAction(id: number, input: { name: string; description: string; color: string }) {
  const user = await requireDatabaseUser("Pages & Spaces");
  await requireSpaceOwner(user, id);
  await db.update(spaces).set({ name: cleanSpaceName(input.name), description: cleanSpaceDescription(input.description), color: validSpaceColor(input.color), updatedAt: new Date() }).where(eq(spaces.id, id));
  refresh(id);
}

export async function setSpaceFavoriteAction(id: number, value: boolean) {
  const user = await requireDatabaseUser("Pages & Spaces");
  await requireSpaceOwner(user, id);
  await db.update(spaces).set({ isFavorite: value }).where(eq(spaces.id, id));
  refresh(id);
}

export async function duplicateSpaceAction(id: number) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const source = await ownedSpace(id, user);
  const sourcePages = await db.select().from(spacePages).where(eq(spacePages.spaceId, id));
  const [copy] = await db.insert(spaces).values({ userId: user.id, name: duplicateName(source.name), description: source.description, color: source.color }).returning();
  if (sourcePages.length) await db.insert(spacePages).values(sourcePages.map((page) => ({ spaceId: copy.id, createdByUserId: user.id, updatedByUserId: user.id, title: page.title, template: page.template, content: page.content, isFavorite: page.isFavorite, archivedAt: page.archivedAt })));
  refresh(copy.id);
  return copy.id;
}

export async function archiveSpaceAction(id: number) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const row = await requireSpaceOwner(user, id);
  if (row.archivedAt) throw new Error("Space is already archived.");
  await db.update(spaces).set({ archivedAt: new Date(), isFavorite: false, updatedAt: new Date() }).where(eq(spaces.id, id));
  refresh(id);
}

export async function restoreSpaceAction(id: number) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const row = await requireSpaceOwner(user, id);
  if (!row.archivedAt) throw new Error("Space is not archived.");
  await db.update(spaces).set({ archivedAt: null, updatedAt: new Date() }).where(eq(spaces.id, id));
  refresh(id);
}

export async function permanentlyDeleteSpaceAction(id: number) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const row = await requireSpaceOwner(user, id);
  if (!row.archivedAt) throw new Error("Archive this space before deleting it permanently.");
  await db.delete(spaces).where(eq(spaces.id, id));
  refresh();
}

export async function createPageAction(input: { spaceId: number; title: string; template: string }) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const space = await ownedSpace(input.spaceId, user);
  if (space.archivedAt) throw new Error("Restore this space before adding a page.");
  const template = validPageTemplate(input.template);
  const [row] = await db.insert(spacePages).values({ spaceId: space.id, createdByUserId: user.id, updatedByUserId: user.id, title: cleanPageTitle(input.title), template, content: templateDocument(template) }).returning();
  await touchSpace(space.id);
  refresh(space.id, row.id);
  return { spaceId: space.id, pageId: row.id };
}

export async function savePageAction(id: number, input: { title?: string; content?: PageDocument }) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const current = await ownedPage(id, user);
  if (current.space.archivedAt || current.page.archivedAt) throw new Error("Restore this page before editing it.");
  const values: { title?: string; content?: Record<string, unknown>; updatedByUserId: number; updatedAt: Date } = { updatedByUserId: user.id, updatedAt: new Date() };
  if (input.title !== undefined) values.title = cleanPageTitle(input.title);
  if (input.content !== undefined) values.content = validPageDocument(input.content);
  const [row] = await db.update(spacePages).set(values).where(eq(spacePages.id, id)).returning();
  await touchSpace(row.spaceId);
  refresh(row.spaceId, id);
  return pageFromRow(row, person(user));
}

export async function movePageAction(id: number, destinationSpaceId: number) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const current = await ownedPage(id, user);
  const destination = await ownedSpace(destinationSpaceId, user);
  if (destination.archivedAt) throw new Error("Choose an active destination space.");
  if (current.page.spaceId === destinationSpaceId) return { spaceId: destinationSpaceId, pageId: id };
  await db.update(spacePages).set({ spaceId: destinationSpaceId, updatedByUserId: user.id, updatedAt: new Date() }).where(eq(spacePages.id, id));
  await Promise.all([touchSpace(current.page.spaceId), touchSpace(destinationSpaceId)]);
  refresh(current.page.spaceId); refresh(destinationSpaceId, id);
  return { spaceId: destinationSpaceId, pageId: id };
}

export async function duplicatePageAction(id: number) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const current = await ownedPage(id, user);
  if (current.page.archivedAt || current.space.archivedAt) throw new Error("Restore this page before duplicating it.");
  const [row] = await db.insert(spacePages).values({ spaceId: current.page.spaceId, createdByUserId: user.id, updatedByUserId: user.id, title: duplicateName(current.page.title), template: current.page.template, content: current.page.content }).returning();
  await touchSpace(row.spaceId);
  refresh(row.spaceId, row.id);
  return { spaceId: row.spaceId, pageId: row.id };
}

export async function setPageFavoriteAction(id: number, value: boolean) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const current = await ownedPage(id, user);
  if (current.page.archivedAt) throw new Error("Restore this page before favoriting it.");
  await db.update(spacePages).set({ isFavorite: value }).where(eq(spacePages.id, id));
  refresh(current.page.spaceId, id);
}

export async function archivePageAction(id: number) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const current = await ownedPage(id, user);
  if (current.page.archivedAt) throw new Error("Page is already archived.");
  await db.update(spacePages).set({ archivedAt: new Date(), isFavorite: false, updatedByUserId: user.id, updatedAt: new Date() }).where(eq(spacePages.id, id));
  await touchSpace(current.page.spaceId);
  refresh(current.page.spaceId, id);
}

export async function restorePageAction(id: number) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const current = await ownedPage(id, user);
  if (!current.page.archivedAt) throw new Error("Page is not archived.");
  if (current.space.archivedAt) throw new Error("Restore the space before restoring this page.");
  await db.update(spacePages).set({ archivedAt: null, updatedByUserId: user.id, updatedAt: new Date() }).where(eq(spacePages.id, id));
  await touchSpace(current.page.spaceId);
  refresh(current.page.spaceId, id);
}

export async function permanentlyDeletePageAction(id: number) {
  const user = await requireDatabaseUser("Pages & Spaces");
  const current = await ownedPage(id, user);
  if (!current.page.archivedAt) throw new Error("Archive this page before deleting it permanently.");
  await db.delete(spacePages).where(eq(spacePages.id, id));
  await touchSpace(current.page.spaceId);
  refresh(current.page.spaceId);
}

export async function getSpaceCollaboratorsAction(spaceId: number): Promise<SpaceCollaborator[]> {
  const current = await requireDatabaseUser("space collaboration");
  const space = await requireSpaceAccess(current, spaceId).then((access) => access.space);
  const [owner] = await db.select().from(users).where(eq(users.id, space.userId)).limit(1);
  const rows = await db.select({ member: spaceMembers, user: users }).from(spaceMembers).leftJoin(users, eq(spaceMembers.userId, users.id)).where(eq(spaceMembers.spaceId, spaceId)).orderBy(asc(spaceMembers.createdAt));
  return [
    { id: `owner:${space.userId}`, name: owner?.name ?? null, email: owner?.email ?? "", imageUrl: owner?.imageUrl ?? null, role: "owner", status: "active" },
    ...rows.map(({ member, user }): SpaceCollaborator => ({ id: String(member.id), name: user?.name ?? null, email: member.email, imageUrl: user?.imageUrl ?? null, role: "editor", status: member.userId == null ? "pending" : "active" })),
  ];
}

export async function inviteSpaceCollaboratorAction(spaceId: number, email: string): Promise<SpaceCollaborator> {
  const current = await requireDatabaseUser("space collaboration");
  await requireSpaceOwner(current, spaceId);
  const normalized = assertSpaceInviteEmail(email);
  if (normalized === current.email.toLowerCase()) throw new Error("You already own this space.");
  const [existing] = await db.select().from(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.email, normalized))).limit(1);
  if (existing) throw new Error("This space is already shared with that email.");
  const [invitedUser] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  const [member] = await db.insert(spaceMembers).values({ spaceId, userId: invitedUser?.id ?? null, email: normalized, invitedByUserId: current.id }).returning();
  refresh(spaceId);
  return { id: String(member.id), name: invitedUser?.name ?? null, email: normalized, imageUrl: invitedUser?.imageUrl ?? null, role: "editor", status: invitedUser ? "active" : "pending" };
}

export async function removeSpaceCollaboratorAction(spaceId: number, memberId: number) {
  const current = await requireDatabaseUser("space collaboration");
  await requireSpaceOwner(current, spaceId);
  const [removed] = await db.delete(spaceMembers).where(and(eq(spaceMembers.id, memberId), eq(spaceMembers.spaceId, spaceId))).returning({ id: spaceMembers.id });
  if (!removed) throw new Error("Collaborator not found.");
  refresh(spaceId);
}

export async function getPageTaskLinksAction(pageId: number): Promise<LinkedTask[]> {
  const current = await requireDatabaseUser("linked tasks");
  await ownedPage(pageId, current);
  const sharedBoardIds = await accessibleBoardIds(current);
  const boards = await db.select().from(kanbanBoards).where(sharedBoardIds.length ? or(eq(kanbanBoards.userId, current.id), inArray(kanbanBoards.id, sharedBoardIds)) : eq(kanbanBoards.userId, current.id));
  if (!boards.length) return [];
  const tasks = await db.select().from(kanbanTasks).where(inArray(kanbanTasks.boardId, boards.map((board) => board.id)));
  const links = await db.select().from(spacePageTaskLinks).where(eq(spacePageTaskLinks.pageId, pageId));
  const linkedIds = new Set(links.map((link) => link.taskId));
  const boardNames = new Map(boards.map((board) => [board.id, board.name]));
  return tasks.map((task) => ({ id: task.id, title: task.title, boardId: task.boardId, boardName: boardNames.get(task.boardId) ?? "Board", linked: linkedIds.has(task.id) }));
}

export async function setPageTaskLinkAction(pageId: number, taskId: number, linked: boolean) {
  const current = await requireDatabaseUser("linked tasks");
  const page = await ownedPage(pageId, current);
  const [task] = await db.select().from(kanbanTasks).where(eq(kanbanTasks.id, taskId)).limit(1);
  if (!task) throw new Error("Task not found.");
  await requireKanbanBoardAccess(current, task.boardId);
  if (linked) await db.insert(spacePageTaskLinks).values({ pageId, taskId, createdByUserId: current.id }).onConflictDoNothing();
  else await db.delete(spacePageTaskLinks).where(and(eq(spacePageTaskLinks.pageId, pageId), eq(spacePageTaskLinks.taskId, taskId)));
  refresh(page.space.id, pageId);
}
