export const THEMES = ["light", "dark", "system"] as const;
export const CALENDAR_VIEWS = ["month", "week", "day"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export const AI_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.1-pro-preview"] as const;
export const AI_BEHAVIORS = ["helpful", "balanced", "creative"] as const;
export const AI_TONES = ["friendly", "professional", "concise", "casual"] as const;
export const CATEGORY_SCOPES = ["calendar", "task", "note", "reminder"] as const;
export const CATEGORY_ICONS = ["tag", "briefcase", "heart", "book-open", "sparkles", "home", "dumbbell", "palette", "plane", "coffee", "bell", "calendar-days"] as const;
export const CATEGORY_COLORS = ["#7057E8", "#3979CA", "#359568", "#C37719", "#CE6542", "#D44F82", "#168C9B"] as const;

export type ThemePreference = typeof THEMES[number];
export type CategoryScope = typeof CATEGORY_SCOPES[number];
export type AiModel = typeof AI_MODELS[number];

export type NotificationPreferences = {
  browserReminders: boolean;
  dueDateAlerts: boolean;
  commentActivity: boolean;
  productUpdates: boolean;
};

export type AiFeatureFlags = {
  notesRefine: boolean;
  whiteboardDiagrams: boolean;
  templateBuilder: boolean;
  assistant: boolean;
};

export type SettingsSnapshot = {
  theme: ThemePreference;
  notifications: NotificationPreferences;
  defaultCalendarView: typeof CALENDAR_VIEWS[number];
  defaultTaskPriority: typeof TASK_PRIORITIES[number];
  autoSave: boolean;
  aiModel: AiModel;
  aiBehavior: typeof AI_BEHAVIORS[number];
  aiTone: typeof AI_TONES[number];
  aiFeatures: AiFeatureFlags;
};

export type SettingsPatch = Partial<SettingsSnapshot>;

export type UserCategory = {
  id: number;
  name: string;
  color: string;
  icon: string;
  scope: CategoryScope;
  position: number;
};

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  theme: "system",
  notifications: { browserReminders: true, dueDateAlerts: true, commentActivity: true, productUpdates: false },
  defaultCalendarView: "month",
  defaultTaskPriority: "medium",
  autoSave: true,
  aiModel: "gemini-3.5-flash",
  aiBehavior: "balanced",
  aiTone: "professional",
  aiFeatures: { notesRefine: true, whiteboardDiagrams: true, templateBuilder: true, assistant: true },
};

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Choose a valid ${field}.`);
  return value as T[number];
}

function booleanMap<T extends Record<string, boolean>>(value: unknown, fallback: T): T {
  if (!value || typeof value !== "object") return fallback;
  return Object.fromEntries(Object.entries(fallback).map(([key, defaultValue]) => [key, typeof (value as Record<string, unknown>)[key] === "boolean" ? (value as Record<string, boolean>)[key] : defaultValue])) as T;
}

export function normalizeSettings(value?: Partial<SettingsSnapshot> | null): SettingsSnapshot {
  const source = value ?? {};
  return {
    theme: THEMES.includes(source.theme as ThemePreference) ? source.theme as ThemePreference : DEFAULT_SETTINGS.theme,
    notifications: booleanMap(source.notifications, DEFAULT_SETTINGS.notifications),
    defaultCalendarView: CALENDAR_VIEWS.includes(source.defaultCalendarView as never) ? source.defaultCalendarView as SettingsSnapshot["defaultCalendarView"] : DEFAULT_SETTINGS.defaultCalendarView,
    defaultTaskPriority: TASK_PRIORITIES.includes(source.defaultTaskPriority as never) ? source.defaultTaskPriority as SettingsSnapshot["defaultTaskPriority"] : DEFAULT_SETTINGS.defaultTaskPriority,
    autoSave: typeof source.autoSave === "boolean" ? source.autoSave : DEFAULT_SETTINGS.autoSave,
    aiModel: AI_MODELS.includes(source.aiModel as AiModel) ? source.aiModel as AiModel : DEFAULT_SETTINGS.aiModel,
    aiBehavior: AI_BEHAVIORS.includes(source.aiBehavior as never) ? source.aiBehavior as SettingsSnapshot["aiBehavior"] : DEFAULT_SETTINGS.aiBehavior,
    aiTone: AI_TONES.includes(source.aiTone as never) ? source.aiTone as SettingsSnapshot["aiTone"] : DEFAULT_SETTINGS.aiTone,
    aiFeatures: booleanMap(source.aiFeatures, DEFAULT_SETTINGS.aiFeatures),
  };
}

export function validateSettingsPatch(input: unknown): SettingsPatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid settings update.");
  const patch = input as Record<string, unknown>;
  const result: SettingsPatch = {};
  if ("theme" in patch) result.theme = enumValue(patch.theme, THEMES, "theme");
  if ("defaultCalendarView" in patch) result.defaultCalendarView = enumValue(patch.defaultCalendarView, CALENDAR_VIEWS, "calendar view");
  if ("defaultTaskPriority" in patch) result.defaultTaskPriority = enumValue(patch.defaultTaskPriority, TASK_PRIORITIES, "task priority");
  if ("aiModel" in patch) result.aiModel = enumValue(patch.aiModel, AI_MODELS, "AI model");
  if ("aiBehavior" in patch) result.aiBehavior = enumValue(patch.aiBehavior, AI_BEHAVIORS, "AI behavior");
  if ("aiTone" in patch) result.aiTone = enumValue(patch.aiTone, AI_TONES, "AI tone");
  if ("autoSave" in patch) { if (typeof patch.autoSave !== "boolean") throw new Error("Auto-save must be on or off."); result.autoSave = patch.autoSave; }
  if ("notifications" in patch) result.notifications = booleanMap(patch.notifications, DEFAULT_SETTINGS.notifications);
  if ("aiFeatures" in patch) result.aiFeatures = booleanMap(patch.aiFeatures, DEFAULT_SETTINGS.aiFeatures);
  return result;
}

export function validateCategory(input: { name?: unknown; color?: unknown; icon?: unknown; scope?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 40) throw new Error("Enter a category name up to 40 characters.");
  const color = enumValue(input.color, CATEGORY_COLORS, "category color");
  const icon = enumValue(input.icon, CATEGORY_ICONS, "category icon");
  const scope = enumValue(input.scope, CATEGORY_SCOPES, "category type");
  return { name, color, icon, scope };
}

export function resolveAiModel(value: unknown): AiModel {
  return AI_MODELS.includes(value as AiModel) ? value as AiModel : DEFAULT_SETTINGS.aiModel;
}
