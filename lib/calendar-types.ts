export type CalendarView = "month" | "week" | "day";
export type CalendarItemType = "task" | "reminder";
export type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type RecurrenceEndMode = "never" | "date" | "count";

export type CalendarCategory = {
  id: number;
  name: string;
  color: string;
  scope: "calendar" | "task" | "reminder";
  icon: string;
  isDefault: boolean;
};

export type CalendarItem = {
  id: number;
  categoryId: number | null;
  type: CalendarItemType;
  title: string;
  description: string;
  isDraft: boolean;
  isCompleted: boolean;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  notificationOffset: number | null;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceEndMode: RecurrenceEndMode;
  recurrenceEndDate: string | null;
  recurrenceCount: number | null;
  exceptions: CalendarItemException[];
};

export type CalendarItemException = {
  id: number;
  itemId: number;
  originalStart: string;
  cancelled: boolean;
  overrides: Partial<CalendarItem> | null;
};

export type CalendarOccurrence = CalendarItem & {
  occurrenceKey: string;
  originalStart: string;
  occurrenceStart: Date;
  occurrenceEnd: Date;
};

export type CalendarItemInput = Omit<
  CalendarItem,
  "id" | "isCompleted" | "exceptions"
> & { id?: number; isCompleted?: boolean };

export const CATEGORY_COLORS = [
  "#7057E8",
  "#3979CA",
  "#359568",
  "#C37719",
  "#CE6542",
  "#D44F82",
  "#168C9B",
] as const;
