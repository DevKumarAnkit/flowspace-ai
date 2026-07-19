import assert from "node:assert/strict";
import test from "node:test";
import { assertCanAddColumn, assertUniqueColumnName, cleanName, nextPositions, restoreColumnId, validateTaskFields } from "./kanban-domain.ts";

test("board and column names are trimmed and bounded", () => {
  assert.equal(cleanName("  Launch  ", "board"), "Launch");
  assert.throws(() => cleanName("", "board"), /up to 40/);
  assert.throws(() => cleanName("x".repeat(41), "column"), /up to 40/);
});

test("a board accepts no more than five columns", () => {
  assert.doesNotThrow(() => assertCanAddColumn(4));
  assert.throws(() => assertCanAddColumn(5), /up to five/);
});

test("column names are unique within a board regardless of case or spacing", () => {
  const columns = [{ id: 1, name: "Todo" }, { id: 2, name: "In Progress" }];
  assert.throws(() => assertUniqueColumnName(" todo ", columns), /already has/);
  assert.doesNotThrow(() => assertUniqueColumnName("Done", columns));
  assert.doesNotThrow(() => assertUniqueColumnName("TODO", columns, 1));
});

test("task fields validate title, date, priority, and description", () => {
  assert.deepEqual(validateTaskFields("  Ship it ", " Context ", "2026-07-19", "high"), {
    title: "Ship it",
    description: "Context",
    priority: "high",
  });
  assert.throws(() => validateTaskFields("", "", "2026-07-19", "low"), /title/);
  assert.throws(() => validateTaskFields("Task", "", "19-07-2026", "low"), /due date/);
  assert.throws(() => validateTaskFields("Task", "", "2026-07-19", "urgent"), /priority/);
});

test("task reorder positions are stable and contiguous", () => {
  assert.deepEqual(nextPositions([8, 3, 11]), [
    { id: 8, position: 0 },
    { id: 3, position: 1 },
    { id: 11, position: 2 },
  ]);
});

test("completion restoration prefers the last valid non-completion column", () => {
  const columns = [
    { id: 10, isCompletion: false, position: 1 },
    { id: 20, isCompletion: false, position: 0 },
    { id: 30, isCompletion: true, position: 2 },
  ];
  assert.equal(restoreColumnId(10, columns), 10);
  assert.equal(restoreColumnId(99, columns), 20);
  assert.equal(restoreColumnId(null, [{ id: 30, isCompletion: true, position: 0 }]), null);
});
