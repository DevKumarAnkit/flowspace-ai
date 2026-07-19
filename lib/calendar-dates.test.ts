import assert from "node:assert/strict";
import { test } from "node:test";
import { dateKey, expandOccurrences, monthGrid, startOfMondayWeek } from "./calendar-dates.ts";
import type { CalendarItem } from "./calendar-types.ts";

function recurringItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: 1,
    categoryId: null,
    type: "task",
    title: "Recurring task",
    description: "",
    isDraft: false,
    isCompleted: false,
    allDay: true,
    startDate: "2026-01-31",
    endDate: "2026-02-01",
    startsAt: null,
    endsAt: null,
    timeZone: "Asia/Calcutta",
    notificationOffset: null,
    recurrenceFrequency: "monthly",
    recurrenceEndMode: "count",
    recurrenceEndDate: null,
    recurrenceCount: 3,
    exceptions: [],
    ...overrides,
  };
}

test("month grid is always 42 days and starts on Monday", () => {
  const grid = monthGrid(new Date(2026, 6, 19));
  assert.equal(grid.length, 42);
  assert.equal(grid[0].getDay(), 1);
  assert.equal(dateKey(grid[0]), "2026-06-29");
});

test("week boundaries use Monday regardless of the selected weekday", () => {
  assert.equal(dateKey(startOfMondayWeek(new Date(2026, 6, 19))), "2026-07-13");
});

test("monthly recurrence skips invalid dates and honors occurrence count", () => {
  const result = expandOccurrences([recurringItem()], new Date(2026, 0, 1), new Date(2026, 6, 1));
  assert.deepEqual(result.map((entry) => dateKey(entry.occurrenceStart)), ["2026-01-31", "2026-03-31", "2026-05-31"]);
});

test("cancelled and moved occurrence exceptions are merged", () => {
  const item = recurringItem({
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    recurrenceFrequency: "daily",
    recurrenceCount: 3,
    exceptions: [
      { id: 1, itemId: 1, originalStart: "2026-07-21", cancelled: true, overrides: null },
      { id: 2, itemId: 1, originalStart: "2026-07-22", cancelled: false, overrides: { startDate: "2026-07-24", endDate: "2026-07-25" } },
    ],
  });
  const result = expandOccurrences([item], new Date(2026, 6, 19), new Date(2026, 6, 26));
  assert.deepEqual(result.map((entry) => dateKey(entry.occurrenceStart)), ["2026-07-20", "2026-07-24"]);
});
