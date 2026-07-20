import { currentUser } from "@clerk/nextjs/server";
import { getUserSettings } from "@/lib/settings-server";
import { hasProAccess } from "@/lib/billing";
import { GoogleGenAI } from "@google/genai";
import { DIAGRAM_COLORS, validateAiDiagram, validateDiagramPrompt } from "@/lib/whiteboard-domain";

export const runtime = "nodejs";

const diagramSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "A concise title for the diagram." },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique short alphanumeric identifier." },
          label: { type: "string", description: "Clear, concise text shown inside the node." },
          shape: { type: "string", enum: ["rectangle", "ellipse", "diamond"] },
          row: { type: "integer" },
          column: { type: "integer" },
          color: { type: "string", enum: [...DIAGRAM_COLORS] },
        },
        required: ["id", "label", "shape", "row", "column", "color"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" }, to: { type: "string" }, label: { type: "string" },
          style: { type: "string", enum: ["solid", "dashed"] },
        },
        required: ["from", "to", "style"],
      },
    },
  },
  required: ["title", "nodes", "edges"],
} as const;

type ProviderError = Error & {
  status?: number;
  statusCode?: number;
  code?: string | number;
  error?: { code?: number; message?: string; status?: string };
};

function providerStatus(error: ProviderError) {
  const status = error.status ?? error.statusCode ?? error.error?.code;
  if (typeof status === "number") return status;
  const code = Number(error.code);
  return Number.isFinite(code) ? code : undefined;
}

function safeProviderError(error: ProviderError, model: string) {
  const status = providerStatus(error);
  const message = error.message || error.error?.message || "Unknown Gemini error";
  if (status === 429 || /rate.?limit|quota|resource_exhausted/i.test(message)) {
    return { status: 429, error: "Gemini’s rate limit or quota was exceeded. Please try again later." };
  }
  if (status === 404 || /model.*(?:not found|unavailable|no longer available)|invalid model/i.test(message)) {
    return { status: 503, error: `The configured Gemini model (${model}) is unavailable. Check GEMINI_MODEL.` };
  }
  if (status === 401 || status === 403 || /api.?key|unauthenticated|permission/i.test(message)) {
    return { status: 503, error: "Gemini rejected the server API key. Check GEMINI_API_KEY." };
  }
  if (/fetch failed|connection|network/i.test(message)) {
    return { status: 502, error: "The server could not reach Gemini. Please try again." };
  }
  if (status === 400 || /invalid argument|bad request/i.test(message)) {
    return { status: 502, error: "Gemini rejected the diagram request. Please try a simpler prompt." };
  }
  return { status: 502, error: "Gemini could not generate the diagram. Please try again." };
}

function stripJsonFences(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function POST(request: Request) {
  if (!(await currentUser())) return Response.json({ error: "You must be signed in to generate diagrams." }, { status: 401 });
  const { settings } = await getUserSettings();
  if (!settings.aiFeatures.whiteboardDiagrams) return Response.json({ error: "AI diagrams are disabled in your settings." }, { status: 403 });
  if (!(await hasProAccess())) return Response.json({ error: "AI diagrams are available with Flowspace Pro." }, { status: 403 });
  const apiKey = process.env.GEMINI_API_KEY;
  const model = settings.aiModel || process.env.GEMINI_MODEL || "gemini-3.5-flash";
  if (!apiKey) {
    console.error("[whiteboard-ai] Missing required server environment variable", { variable: "GEMINI_API_KEY", model });
    return Response.json({ error: "Gemini is not configured. Add GEMINI_API_KEY on the server." }, { status: 503 });
  }

  let prompt: string;
  try {
    prompt = validateDiagramPrompt(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enter a valid diagram prompt.";
    console.error("[whiteboard-ai] Invalid request payload", { message });
    return Response.json({ error: message }, { status: 400 });
  }

  let rawResponse: string;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model,
      store: false,
      system_instruction: `You design compact, readable whiteboard diagrams with a ${settings.aiBehavior} approach. Convert the request into a grid of editable nodes and directed edges. Use rows for vertical progression and columns for branches. Avoid duplicate grid cells. Use diamonds only for decisions, ellipses for starts/ends or central mind-map ideas, and rectangles otherwise. Architecture diagrams should group related tiers by rows. User journeys and processes should flow left-to-right unless the prompt requests otherwise. Return only schema-compliant JSON.`,
      generation_config: { thinking_level: "low", max_output_tokens: 8192 },
      response_format: { type: "text", mime_type: "application/json", schema: diagramSchema },
      input: prompt,
    });
    rawResponse = interaction.output_text ?? "";
    console.info("[whiteboard-ai] Raw Gemini response before parsing", { model, response: rawResponse });
  } catch (error) {
    const providerError = error instanceof Error ? error as ProviderError : new Error(String(error)) as ProviderError;
    const safe = safeProviderError(providerError, model);
    console.error("[whiteboard-ai] Gemini API request failed", {
      model,
      name: providerError.name,
      status: providerStatus(providerError),
      code: providerError.code,
      providerStatus: providerError.error?.status,
      message: providerError.message,
      providerMessage: providerError.error?.message,
      category: safe.status === 429 ? "rate-limit-or-quota" : safe.status === 503 ? "configuration-or-model" : "provider-request",
    });
    return Response.json({ error: safe.error }, { status: safe.status });
  }

  if (!rawResponse.trim()) {
    console.error("[whiteboard-ai] Gemini returned an empty response", { model });
    return Response.json({ error: "Gemini returned an empty response. Please try again." }, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(rawResponse));
  } catch (error) {
    console.error("[whiteboard-ai] Gemini JSON parsing failed", { model, message: error instanceof Error ? error.message : String(error), rawResponse });
    return Response.json({ error: "Gemini returned invalid JSON. Please try generating the diagram again." }, { status: 502 });
  }

  try {
    const diagram = validateAiDiagram(parsed);
    return Response.json(diagram, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[whiteboard-ai] Gemini diagram schema validation failed", { model, message: error instanceof Error ? error.message : String(error), parsedResponse: parsed, rawResponse });
    return Response.json({ error: "Gemini returned an invalid diagram structure. Please try a simpler prompt." }, { status: 502 });
  }
}
