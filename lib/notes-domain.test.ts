import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanNoteTitle,
  duplicateTitle,
  formatNoteTime,
  sortNotes,
  validateRefineInput,
  validDocument,
  validNoteColor,
  validNoteIcon,
} from "./notes-domain.ts";

test("note titles are trimmed and limited", () => {
  assert.equal(cleanNoteTitle("  Project plan  "), "Project plan");
  assert.throws(() => cleanNoteTitle(""), /up to 160/);
  assert.throws(() => cleanNoteTitle("x".repeat(161)), /up to 160/);
});

test("note colors and Tiptap documents are validated", () => {
  assert.equal(validNoteColor("#7057E8"), "#7057E8");
  assert.throws(() => validNoteColor("#000000"), /supported/);
  assert.equal(validNoteIcon("idea"), "idea");
  assert.throws(() => validNoteIcon("rocket"), /supported/);
  assert.deepEqual(validDocument({ type: "doc", content: [] }), { type: "doc", content: [] });
  assert.throws(() => validDocument({ type: "paragraph" }), /not valid/);
});

test("duplicate titles remain inside the title limit", () => {
  assert.equal(duplicateTitle("Ideas"), "Ideas Copy");
  assert.equal(duplicateTitle("x".repeat(160)).length, 160);
});

test("notes sort pinned first and recent within each group", () => {
  const sorted = sortNotes([
    { id: 1, isPinned: false, updatedAt: "2026-07-18T10:00:00.000Z" },
    { id: 2, isPinned: true, updatedAt: "2026-07-17T10:00:00.000Z" },
    { id: 3, isPinned: false, updatedAt: "2026-07-19T10:00:00.000Z" },
  ]);
  assert.deepEqual(sorted.map((note) => note.id), [2, 3, 1]);
});

test("Gemini refine requests enforce action, tone, and length", () => {
  assert.deepEqual(validateRefineInput({ text: "Hello", action: "grammar" }), { text: "Hello", action: "grammar", tone: undefined });
  assert.deepEqual(validateRefineInput({ text: "Hello", action: "tone", tone: "Friendly" }), { text: "Hello", action: "tone", tone: "Friendly" });
  assert.throws(() => validateRefineInput({ text: "", action: "grammar" }), /10,000/);
  assert.throws(() => validateRefineInput({ text: "Hello", action: "unknown" }), /valid refine/);
  assert.throws(() => validateRefineInput({ text: "Hello", action: "tone", tone: "Angry" }), /valid tone/);
});

test("relative note timestamps distinguish today, yesterday, and older dates", () => {
  const now = new Date(2026, 6, 19, 15, 0);
  assert.match(formatNoteTime(new Date(2026, 6, 19, 10, 30), now), /^Today,/);
  assert.equal(formatNoteTime(new Date(2026, 6, 18, 10, 30), now), "Yesterday");
  assert.match(formatNoteTime(new Date(2026, 6, 10, 10, 30), now), /(?:Jul.*10|10.*Jul)/);
});
