export const ASSISTANT_ACTION_TYPES = ["create_task", "create_board", "create_reminder", "create_note", "create_whiteboard", "generate_template", "update_settings"] as const;
export type AssistantActionType = typeof ASSISTANT_ACTION_TYPES[number];
export type AssistantAction = { type: AssistantActionType; summary: string; payload: Record<string, unknown> };

export function validateAssistantPrompt(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter a message for the assistant.");
  const prompt = value.trim();
  if (!prompt || prompt.length > 4_000) throw new Error("Messages must be between 1 and 4,000 characters.");
  return prompt;
}

export function validateAssistantAction(value: unknown): AssistantAction {
  if (!value || typeof value !== "object") throw new Error("Invalid assistant action.");
  const action = value as Record<string, unknown>;
  if (typeof action.type !== "string" || !ASSISTANT_ACTION_TYPES.includes(action.type as AssistantActionType)) throw new Error("Unsupported assistant action.");
  if (typeof action.summary !== "string" || !action.summary.trim() || action.summary.length > 240) throw new Error("Assistant action needs a concise summary.");
  if (!action.payload || typeof action.payload !== "object" || Array.isArray(action.payload)) throw new Error("Assistant action is missing details.");
  return { type: action.type as AssistantActionType, summary: action.summary.trim(), payload: action.payload as Record<string, unknown> };
}

export function parseAssistantResponse(value: string): { message: string; action?: AssistantAction } {
  const parsed = JSON.parse(value) as { message?: unknown; action?: unknown };
  if (typeof parsed.message !== "string" || !parsed.message.trim()) throw new Error("Assistant returned an invalid response.");
  return { message: parsed.message.trim(), action: parsed.action ? validateAssistantAction(parsed.action) : undefined };
}
