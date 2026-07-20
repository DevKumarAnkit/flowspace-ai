export const NOTE_COLORS = ["#7057E8", "#3979CA", "#359568", "#C37719", "#CE6542", "#D44F82"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];
export const NOTE_ICONS = ["file", "idea", "book", "tasks", "star", "work"] as const;
export type NoteIcon = (typeof NOTE_ICONS)[number];

export const REFINE_ACTIONS = ["grammar", "rephrase", "shorter", "longer", "simplify", "tone"] as const;
export type RefineAction = (typeof REFINE_ACTIONS)[number];
export const REFINE_TONES = ["Professional", "Friendly", "Confident", "Casual"] as const;
export type RefineTone = (typeof REFINE_TONES)[number];

export type TiptapDocument = {
  type: "doc";
  content?: Array<Record<string, unknown>>;
};

export const EMPTY_NOTE_DOCUMENT: TiptapDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type Note = {
  id: number;
  categoryId: number | null;
  title: string;
  content: TiptapDocument;
  color: NoteColor;
  icon: NoteIcon;
  isPinned: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function cleanNoteTitle(title: string) {
  const clean = title.trim();
  if (!clean || clean.length > 160) throw new Error("Enter a note title up to 160 characters.");
  return clean;
}

export function validNoteColor(color: string): NoteColor {
  if (!NOTE_COLORS.includes(color as NoteColor)) throw new Error("Choose a supported note color.");
  return color as NoteColor;
}

export function validNoteIcon(icon: string): NoteIcon {
  if (!NOTE_ICONS.includes(icon as NoteIcon)) throw new Error("Choose a supported note icon.");
  return icon as NoteIcon;
}

export function validDocument(content: unknown): TiptapDocument {
  if (!content || typeof content !== "object" || (content as { type?: unknown }).type !== "doc") {
    throw new Error("The note content is not valid.");
  }
  return content as TiptapDocument;
}

export function duplicateTitle(title: string) {
  const suffix = " Copy";
  return `${title.slice(0, 160 - suffix.length).trimEnd()}${suffix}`;
}

export function sortNotes<T extends Pick<Note, "isPinned" | "updatedAt">>(entries: T[]) {
  return [...entries].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function validateRefineInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Invalid refine request.");
  const { text, action, tone } = input as { text?: unknown; action?: unknown; tone?: unknown };
  if (typeof text !== "string" || !text.trim() || text.length > 10_000) throw new Error("Select between 1 and 10,000 characters.");
  if (typeof action !== "string" || !REFINE_ACTIONS.includes(action as RefineAction)) throw new Error("Choose a valid refine action.");
  if (action === "tone" && (typeof tone !== "string" || !REFINE_TONES.includes(tone as RefineTone))) {
    throw new Error("Choose a valid tone.");
  }
  return { text, action: action as RefineAction, tone: action === "tone" ? tone as RefineTone : undefined };
}

export function formatNoteTime(value: string | Date, now = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay) return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
