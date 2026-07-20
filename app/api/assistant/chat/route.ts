import { GoogleGenAI } from "@google/genai";
import { currentUser } from "@clerk/nextjs/server";
import { appendAssistantMessage, createAssistantAction, createAssistantConversation, getAssistantConversation } from "@/lib/assistant-server";
import { parseAssistantResponse, validateAssistantPrompt } from "@/lib/assistant-domain";
import { getUserSettings } from "@/lib/settings-server";

export const runtime = "nodejs";

const responseSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
    action: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["create_task", "create_board", "create_reminder", "create_note", "create_whiteboard", "generate_template", "update_settings"] },
        summary: { type: "string" },
        payload: { type: "object", additionalProperties: true },
      },
      required: ["type", "summary", "payload"],
    },
  },
  required: ["message"],
} as const;

function isQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|quota exceeded|rate.?limit|resource_exhausted/i.test(message);
}

function retryAfterSeconds(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/retry in\s+([\d.]+)s/i);
  return match ? Math.max(1, Math.ceil(Number(match[1]))) : null;
}

function calendarCommand(prompt: string) {
  if (!/\b(calendar|calender|reminder)\b/i.test(prompt)) return null;
  const timeMatch = prompt.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!timeMatch || !/\b(tomorrow|tommorow|tmrw)\b/i.test(prompt)) return null;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] ?? 0);
  const period = timeMatch[3].toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (period === "pm" && hour !== 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const title = prompt
    .replace(/\b(mark|add|calendar|calender|reminder|for|to|in|on|at|tomorrow|tommorow|tmrw)\b/gi, " ")
    .replace(timeMatch[0], " ")
    .replace(/[,:.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    message: `Adding “${title}” to your calendar tomorrow at ${timeMatch[0].toUpperCase()}.`,
    action: {
      type: "create_reminder" as const,
      summary: `Add ${title} to your calendar tomorrow at ${timeMatch[0].toUpperCase()}`,
      payload: { title, date: date.toISOString().slice(0, 10), time, notificationOffset: 10, timeZone: "Asia/Kolkata" },
    },
  };
}

export async function POST(request: Request) {
  if (!(await currentUser())) return Response.json({ error: "You must be signed in to use AI Assistant." }, { status: 401 });
  try {
    const body = await request.json() as { prompt?: unknown; conversationId?: unknown };
    const prompt = validateAssistantPrompt(body.prompt);
    const current = typeof body.conversationId === "number" ? await getAssistantConversation(body.conversationId) : await createAssistantConversation();
    if (!current) return Response.json({ error: "Conversation not found." }, { status: 404 });
    const userMessage = await appendAssistantMessage(current.id, "user", prompt);
    const directCalendarCommand = calendarCommand(prompt);
    if (directCalendarCommand) {
      const assistantMessage = await appendAssistantMessage(current.id, "assistant", directCalendarCommand.message);
      const action = await createAssistantAction(current.id, directCalendarCommand.action);
      return Response.json({ conversationId: current.id, userMessage, assistantMessage, action }, { headers: { "Cache-Control": "no-store" } });
    }
    const { settings } = await getUserSettings();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return Response.json({ error: "Gemini is not configured yet." }, { status: 503 });
    const history = [...current.messages, userMessage].slice(-14).map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`).join("\n");
    const ai = new GoogleGenAI({ apiKey });
    const model = settings.aiModel || process.env.GEMINI_MODEL || "gemini-3.5-flash";
    const requestFor = (requestedModel: string) => ai.interactions.create({
      model: requestedModel,
      store: false,
      system_instruction: `You are Flowspace, a ${settings.aiBehavior} personal productivity assistant with a ${settings.aiTone} voice. Today is ${new Date().toISOString().slice(0, 10)}. Answer helpfully in plain text. You can produce exactly one workspace action using the supplied action schema; the app saves a complete action immediately. Ask a focused follow-up whenever details are missing. Resolve relative dates such as tomorrow and next Monday to YYYY-MM-DD before proposing an action. For create_reminder, do not create anything until title, date, and time are all known. Its payload MUST be {"title":"Go to gym","date":"YYYY-MM-DD","time":"09:00","notificationOffset":10,"timeZone":"Asia/Kolkata"}. For create_task, payload MUST contain title, dueDate, and priority. For create_board, payload MUST contain name and color. For create_note and create_whiteboard, payload MUST contain title or name. For a board, note, whiteboard, template, or settings update, collect the essential details. Return only JSON matching the response schema.`,
      generation_config: { thinking_level: "low", max_output_tokens: 1200 },
      response_format: { type: "text", mime_type: "application/json", schema: responseSchema },
      input: history,
    });
    let interaction;
    try {
      interaction = await requestFor(model);
    } catch (error) {
      const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";
      if (!isQuotaError(error) || fallbackModel === model) throw error;
      try {
        interaction = await requestFor(fallbackModel);
      } catch (fallbackError) {
        if (!isQuotaError(fallbackError)) throw fallbackError;
        const seconds = retryAfterSeconds(fallbackError) ?? retryAfterSeconds(error);
        const message = `I’m temporarily at my AI request limit${seconds ? ` for about ${seconds} seconds` : ""}. Your message is saved—please try again shortly.`;
        const assistantMessage = await appendAssistantMessage(current.id, "assistant", message);
        return Response.json({ conversationId: current.id, userMessage, assistantMessage }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    const reply = parseAssistantResponse(interaction.output_text ?? "");
    const assistantMessage = await appendAssistantMessage(current.id, "assistant", reply.message);
    const action = reply.action ? await createAssistantAction(current.id, reply.action) : undefined;
    return Response.json({ conversationId: current.id, userMessage, assistantMessage, action }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[assistant] chat request failed", error);
    const message = isQuotaError(error) ? "The AI provider is temporarily rate-limited. Please try again shortly." : "The assistant could not respond. Please try again.";
    return Response.json({ error: message }, { status: isQuotaError(error) ? 429 : 502 });
  }
}
