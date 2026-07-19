import assert from "node:assert/strict";
import test from "node:test";
import { avatarColor, indexTaskThreads, initials, isValidCollaboratorEmail, kanbanRoomId, liveblocksUserId, normalizeCollaboratorEmail } from "./liveblocks-shared.ts";

test("collaboration identifiers are stable and feature-scoped", () => {
  assert.equal(kanbanRoomId(42), "flowspace:kanban-board:42");
  assert.equal(liveblocksUserId(7), "user:7");
  assert.equal(avatarColor("A@Example.com"), avatarColor("A@Example.com"));
});

test("invite emails are normalized and validated", () => {
  assert.equal(normalizeCollaboratorEmail("  Teammate@Example.COM "), "teammate@example.com");
  assert.equal(isValidCollaboratorEmail("teammate@example.com"), true);
  assert.equal(isValidCollaboratorEmail("not-an-email"), false);
});

test("initials favor a name and fall back to email", () => {
  assert.equal(initials("Avery Morgan", "avery@example.com"), "AM");
  assert.equal(initials(null, "jamie.lee@example.com"), "JL");
});

test("task threads are indexed by task metadata and unrelated threads are ignored", () => {
  const first = { metadata: { taskId: "11" }, comments: [{ id: 1 }, { id: 2 }] };
  const unrelated = { metadata: {}, comments: [{ id: 3 }] };
  const index = indexTaskThreads([first, unrelated]);
  assert.equal(index.get("11")?.comments.length, 2);
  assert.equal(index.size, 1);
});
