import type { CalendarItem, CalendarOccurrence } from "@/lib/calendar-types";

const DAY = 86_400_000;

export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfMondayWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

export function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function monthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfMondayWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function addFrequency(date: Date, frequency: CalendarItem["recurrenceFrequency"], amount: number): Date | null {
  const result = new Date(date);
  if (frequency === "daily") result.setDate(result.getDate() + amount);
  if (frequency === "weekly") result.setDate(result.getDate() + amount * 7);
  if (frequency === "monthly") {
    const originalDay = date.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + amount);
    const targetMonth = result.getMonth();
    result.setDate(originalDay);
    if (result.getMonth() !== targetMonth) return null;
  }
  if (frequency === "yearly") {
    const originalMonth = date.getMonth();
    result.setFullYear(result.getFullYear() + amount);
    if (result.getMonth() !== originalMonth) return null;
  }
  return result;
}

function baseRange(item: CalendarItem) {
  if (item.allDay && item.startDate) {
    const start = parseDateKey(item.startDate);
    const end = item.endDate ? parseDateKey(item.endDate) : addDays(start, 1);
    return { start, end };
  }
  if (item.startsAt) {
    const start = new Date(item.startsAt);
    const end = item.endsAt ? new Date(item.endsAt) : new Date(start.getTime() + 3_600_000);
    return { start, end };
  }
  return null;
}

export function expandOccurrences(items: CalendarItem[], rangeStart: Date, rangeEnd: Date) {
  const occurrences: CalendarOccurrence[] = [];

  for (const item of items) {
    if (item.isDraft) continue;
    const base = baseRange(item);
    if (!base) continue;
    const duration = Math.max(base.end.getTime() - base.start.getTime(), item.allDay ? DAY : 1_800_000);
    const repeats = item.recurrenceFrequency !== "none";
    const requestedCount = item.recurrenceEndMode === "count" ? Math.max(1, item.recurrenceCount ?? 1) : Number.POSITIVE_INFINITY;
    let generatedCount = 0;

    for (let index = 0; index < (repeats ? 750 : 1); index += 1) {
      const occurrenceStart = repeats ? addFrequency(base.start, item.recurrenceFrequency, index) : base.start;
      if (!occurrenceStart) continue;
      generatedCount += 1;
      if (generatedCount > requestedCount) break;
      if (item.recurrenceEndMode === "date" && item.recurrenceEndDate) {
        const endDate = parseDateKey(item.recurrenceEndDate);
        endDate.setHours(23, 59, 59, 999);
        if (occurrenceStart > endDate) break;
      }
      if (occurrenceStart >= rangeEnd) break;
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
      const originalStart = item.allDay ? dateKey(occurrenceStart) : occurrenceStart.toISOString();
      const exception = item.exceptions.find((entry) => entry.originalStart === originalStart);
      if (!exception?.cancelled && occurrenceEnd > rangeStart) {
        const override = exception?.overrides ?? {};
        const resolved = { ...item, ...override } as CalendarItem;
        let resolvedStart = occurrenceStart;
        let resolvedEnd = occurrenceEnd;
        if (exception && resolved.allDay && resolved.startDate) {
          resolvedStart = parseDateKey(resolved.startDate);
          resolvedEnd = resolved.endDate ? parseDateKey(resolved.endDate) : addDays(resolvedStart, 1);
        } else if (exception && !resolved.allDay && resolved.startsAt) {
          resolvedStart = new Date(resolved.startsAt);
          resolvedEnd = resolved.endsAt ? new Date(resolved.endsAt) : new Date(resolvedStart.getTime() + 3_600_000);
        }
        occurrences.push({
          ...resolved,
          occurrenceKey: `${item.id}:${originalStart}`,
          originalStart,
          occurrenceStart: resolvedStart,
          occurrenceEnd: resolvedEnd,
        });
      }
      if (!repeats) break;
    }
  }
  return occurrences.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
}

export function toLocalDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
