import assert from "node:assert/strict";
import test from "node:test";
import {
  createGeneratedAppFallback, initialGeneratedAppState, metricValue, validateGeneratedAppDefinition,
  validateGeneratedAppPrompt, validateGeneratedAppState,
} from "./generated-app-domain.ts";

const definition = {
  version: 1,
  appName: "Habit Tracker",
  description: "Track daily habits and weekly progress.",
  icon: "Flame",
  color: "#F97316",
  layout: "single-page",
  sections: [
    { id: "overview", columns: 3, components: [
      { id: "total", type: "stat", title: "Total", dataset: "habits", metric: { operation: "count" } },
      { id: "progress", type: "progress", title: "Progress", dataset: "habits", metric: { operation: "percentage", whereField: "done", whereEquals: true } },
      { id: "habits-list", type: "checklist", title: "Habits", dataset: "habits", labelField: "name", checkedField: "done" },
    ] },
    { id: "manage", columns: 2, components: [
      { id: "add-habit", type: "form", title: "Add habit", fields: [{ key: "name", label: "Name", type: "text", required: true }], actionId: "append-habit", submitLabel: "Add" },
      { id: "reset-button", type: "button", title: "Start over", actionId: "reset-all", label: "Reset", variant: "secondary" },
      { id: "habit-table", type: "table", title: "All habits", dataset: "habits", fields: [{ key: "name", label: "Habit", type: "text" }] },
      { id: "habit-list", type: "list", title: "Today", dataset: "habits", primaryField: "name" },
      { id: "habit-tags", type: "tags", title: "Tags", dataset: "habits", labelField: "name" },
      { id: "habit-chart", type: "chart", title: "Scores", dataset: "habits", categoryField: "name", valueField: "score", chartType: "bar" },
    ] },
  ],
  actions: [
    { id: "append-habit", type: "append-record", dataset: "habits" },
    { id: "clear-habits", type: "clear-dataset", dataset: "habits" },
    { id: "reset-all", type: "reset-data" },
  ],
  sampleData: [{ id: "habits", rows: [{ name: "Drink water", done: true, score: 7 }, { name: "Read", done: false, score: 4 }] }],
};

test("validates a complete generated app contract", () => {
  const valid = validateGeneratedAppDefinition(definition);
  assert.equal(valid.appName, "Habit Tracker");
  assert.equal(valid.sections.flatMap((section) => section.components).length, 9);
  assert.equal(valid.color, "#F97316");
});

test("validates prompt boundaries", () => {
  assert.equal(validateGeneratedAppPrompt({ prompt: "  Build a planner  " }), "Build a planner");
  assert.throws(() => validateGeneratedAppPrompt({ prompt: "" }), /between 1 and 500/);
  assert.throws(() => validateGeneratedAppPrompt({ prompt: "x".repeat(501) }), /between 1 and 500/);
});

test("initializes and validates persisted state", () => {
  const valid = validateGeneratedAppDefinition(definition);
  const state = initialGeneratedAppState(valid);
  assert.equal(state.datasets.habits.length, 2);
  assert.deepEqual(validateGeneratedAppState(state, valid), state);
  assert.throws(() => validateGeneratedAppState({ datasets: { foreign: [] } }, valid), /unknown dataset/);
});

test("computes count, sum, average, and percentage metrics", () => {
  const rows = [{ amount: 10, done: true }, { amount: 20, done: false }];
  assert.equal(metricValue(rows, { operation: "count" }), 2);
  assert.equal(metricValue(rows, { operation: "sum", field: "amount" }), 30);
  assert.equal(metricValue(rows, { operation: "average", field: "amount" }), 15);
  assert.equal(metricValue(rows, { operation: "percentage", whereField: "done", whereEquals: true }), 50);
});

test("rejects unsafe icons, colors, references, and oversized datasets", () => {
  assert.throws(() => validateGeneratedAppDefinition({ ...definition, icon: "Script" }), /icon/i);
  assert.throws(() => validateGeneratedAppDefinition({ ...definition, color: "red" }), /color/i);
  assert.throws(() => validateGeneratedAppDefinition({ ...definition, actions: [{ id: "append-habit", type: "append-record", dataset: "missing" }] }), /missing dataset/);
  assert.throws(() => validateGeneratedAppDefinition({ ...definition, sampleData: [{ id: "habits", rows: Array.from({ length: 101 }, () => ({ name: "x" })) }] }), /too many rows/);
});

test("creates valid fallback apps for common prompts", () => {
  for (const prompt of ["habit tracker", "monthly budget", "weekly meal planner", "study schedule"]) {
    const fallback = createGeneratedAppFallback(prompt);
    assert.ok(fallback.sections.length >= 3);
    assert.ok(fallback.sampleData[0].rows.length >= 3);
    assert.equal(validateGeneratedAppDefinition(fallback).version, 1);
  }
});
