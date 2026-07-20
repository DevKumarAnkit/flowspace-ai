import { currentUser } from "@clerk/nextjs/server";
import { GoogleGenAI } from "@google/genai";
import { validateRefineInput } from "@/lib/notes-domain";
import { getUserSettings } from "@/lib/settings-server";
import { hasProAccess } from "@/lib/billing";

export const runtime = "nodejs";

const ACTION_INSTRUCTIONS = {
  grammar: "Correct grammar, spelling, and punctuation without changing the meaning or voice.",
  rephrase: "Rephrase the text naturally while preserving its meaning and level of detail.",
  shorter: "Make the text meaningfully shorter while retaining the important information.",
  longer: "Expand the text with useful clarity and detail without adding unsupported facts.",
  simplify: "Rewrite the text using simpler, clearer language without losing its meaning.",
  tone: "Rewrite the text in the requested tone while preserving its meaning and facts.",
} as const;

export async function POST(request: Request) {
  if (!(await currentUser())) return Response.json({ error: "You must be signed in to refine notes." }, { status: 401 });
  const { settings } = await getUserSettings();
  if (!settings.aiFeatures.notesRefine) return Response.json({ error: "AI Refine is disabled in your settings." }, { status: 403 });
  if (!(await hasProAccess())) return Response.json({ error: "AI Refine is available with Flowspace Pro." }, { status: 403 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "Gemini is not configured yet." }, { status: 503 });

  try {
    const input = validateRefineInput(await request.json());
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model: settings.aiModel || process.env.GEMINI_MODEL || "gemini-3.5-flash",
      store: false,
      system_instruction: `You are a precise writing editor. Be ${settings.aiBehavior} and use a ${settings.aiTone} voice unless the request specifies another tone. Return only the revised text, with no commentary, labels, markdown fences, or quotation marks. Preserve the source language, meaning, paragraph breaks, and factual claims.`,
      generation_config: { thinking_level: "low", max_output_tokens: 8192 },
      input: `${ACTION_INSTRUCTIONS[input.action]}${input.tone ? ` Use a ${input.tone.toLowerCase()} tone.` : ""}\n\nText to revise:\n${input.text}`,
    });
    const text = interaction.output_text?.trim();
    if (!text) return Response.json({ error: "Gemini returned an empty response." }, { status: 502 });
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refine the selected text.";
    const validationError = /Select between|valid refine|valid tone|Invalid refine/.test(message);
    console.error("Gemini note refinement failed", validationError ? message : error);
    return Response.json({ error: validationError ? message : "Gemini could not refine this text. Please try again." }, { status: validationError ? 400 : 502 });
  }
}
