import { GoogleGenAI } from "@google/genai";
import { db } from "@/db";
import { generatedApps } from "@/db/schema";
import { requireDatabaseUser } from "@/lib/require-database-user";
import { getUserSettings } from "@/lib/settings-server";
import { hasProAccess } from "@/lib/billing";
import {
  GENERATED_APP_ICONS,
  createGeneratedAppFallback,
  initialGeneratedAppState,
  stripGeneratedJsonFences,
  validateGeneratedAppDefinition,
  validateGeneratedAppPrompt,
} from "@/lib/generated-app-domain";

export const runtime = "nodejs";

const fieldSchema = {
  type: "object",
  properties: {
    key: { type: "string" }, label: { type: "string" },
    type: { type: "string", enum: ["text", "number", "date", "textarea", "checkbox", "select"] },
    required: { type: "boolean" }, options: { type: "array", items: { type: "string" } },
  },
  required: ["key", "label", "type"],
} as const;
const metricSchema = {
  type: "object",
  properties: {
    operation: { type: "string", enum: ["count", "sum", "average", "percentage"] },
    field: { type: "string" }, whereField: { type: "string" }, whereEquals: { type: ["string", "number", "boolean"] },
  }, required: ["operation"],
} as const;
const componentSchema = {
  type: "object",
  properties: {
    id: { type: "string" }, type: { type: "string", enum: ["stat", "list", "table", "form", "progress", "checklist", "button", "tags", "chart"] },
    title: { type: "string" }, description: { type: "string" }, dataset: { type: "string" }, metric: metricSchema,
    suffix: { type: "string" }, label: { type: "string" }, primaryField: { type: "string" }, secondaryField: { type: "string" },
    fields: { type: "array", items: fieldSchema }, actionId: { type: "string" }, submitLabel: { type: "string" },
    labelField: { type: "string" }, checkedField: { type: "string" }, variant: { type: "string", enum: ["primary", "secondary", "danger"] },
    categoryField: { type: "string" }, valueField: { type: "string" }, chartType: { type: "string", enum: ["bar", "line", "donut"] },
  }, required: ["id", "type", "title"],
} as const;
const generatedAppSchema = {
  type: "object",
  properties: {
    version: { type: "integer", enum: [1] }, appName: { type: "string" }, description: { type: "string" },
    icon: { type: "string", enum: [...GENERATED_APP_ICONS] }, color: { type: "string" }, layout: { type: "string", enum: ["single-page"] },
    sections: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, columns: { type: "integer", enum: [1, 2, 3] }, components: { type: "array", items: componentSchema } }, required: ["id", "columns", "components"] } },
    actions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, type: { type: "string", enum: ["append-record", "clear-dataset", "reset-data"] }, dataset: { type: "string" } }, required: ["id", "type"] } },
    sampleData: { type: "array", items: { type: "object", properties: { id: { type: "string" }, rows: { type: "array", items: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } } } }, required: ["id", "rows"] } },
  }, required: ["version", "appName", "description", "icon", "color", "layout", "sections", "actions", "sampleData"],
} as const;

type ProviderError = Error & { status?: number; statusCode?: number; code?: string | number; error?: { code?: number; message?: string } };
function providerStatus(error: ProviderError) { const value = error.status ?? error.statusCode ?? error.error?.code ?? Number(error.code); return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function safeProviderError(error: ProviderError) {
  const status = providerStatus(error); const message = error.message || error.error?.message || "";
  if (status === 429 || /rate.?limit|quota|resource_exhausted/i.test(message)) return { status: 429, error: "Gemini's rate limit was reached. Please try again later." };
  if (status === 401 || status === 403 || /api.?key|permission/i.test(message)) return { status: 503, error: "Gemini is not configured correctly." };
  if (status === 404 || /model.*(?:not found|unavailable)/i.test(message)) return { status: 503, error: "The configured Gemini model is unavailable." };
  return { status: 502, error: "Gemini could not generate this app. Please try again." };
}

export async function POST(request: Request) {
  let user;
  try { user = await requireDatabaseUser("AI Template Builder"); }
  catch { return Response.json({ error: "You must be signed in to generate an app." }, { status: 401 }); }
  const { settings } = await getUserSettings();
  if (!settings.aiFeatures.templateBuilder) return Response.json({ error: "AI Template Builder is disabled in your settings." }, { status: 403 });
  if (!(await hasProAccess())) return Response.json({ error: "AI Template Builder is available with Flowspace Pro." }, { status: 403 });
  let prompt: string;
  try { prompt = validateGeneratedAppPrompt(await request.json()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Enter a valid prompt." }, { status: 400 }); }
  const apiKey = process.env.GEMINI_API_KEY;
  const model = settings.aiModel || process.env.GEMINI_TEMPLATE_MODEL || "gemini-3.1-flash-lite";
  if (!apiKey) {
    const definition = createGeneratedAppFallback(prompt);
    const state = initialGeneratedAppState(definition);
    try {
      const [row] = await db.insert(generatedApps).values({ userId: user.id, prompt, definition, state }).returning();
      return Response.json({ app: { id: row.id, prompt: row.prompt, definition, state, sidebarPosition: row.sidebarPosition, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } }, { status: 201, headers: { "Cache-Control": "no-store", "X-Template-Source": "fallback" } });
    } catch (error) {
      console.error("[ai-template-builder] Saving fallback app failed", { userId: user.id, message: error instanceof Error ? error.message : String(error) });
      return Response.json({ error: "Your app could not be saved. Please try again." }, { status: 500 });
    }
  }
  let raw = "";
  let definition;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model, store: false,
      system_instruction: "Design a useful, attractive single-page personal productivity mini app as declarative JSON. Follow the supplied response schema exactly, even if you know another app-template format. Use lowercase stable IDs. IMPORTANT: sections use columns (1, 2, or 3), never gridWidth. actions MUST be an array of {id,type,dataset?}, never a keyed object. sampleData MUST be an array of {id,rows}, never a keyed object. Fields use key, not id. Components reference datasets with dataset, not datasource. Every form uses actionId and every table uses fields. Every checklist uses dataset, labelField, and checkedField. Every chart uses dataset, categoryField, and valueField. Stat/progress components use a metric object. Only use an icon from the schema enum. Include realistic sample data and 2-4 sections with 5-9 total components. Do not output code, HTML, URLs, markdown, unsupported keys, or an alternate schema. Return only schema-compliant JSON.",
      generation_config: { thinking_level: "low", max_output_tokens: 12000 },
      response_format: { type: "text", mime_type: "application/json", schema: generatedAppSchema },
      input: prompt,
    });
    raw = interaction.output_text ?? "";
  } catch (error) {
    const safe = safeProviderError(error instanceof Error ? error as ProviderError : new Error(String(error)) as ProviderError);
    console.error("[ai-template-builder] Gemini request failed", { model, status: error instanceof Error ? providerStatus(error as ProviderError) : undefined, message: error instanceof Error ? error.message : String(error) });
    if (safe.status === 429 || /model|unavailable/i.test(safe.error)) definition = createGeneratedAppFallback(prompt);
    else return Response.json({ error: safe.error }, { status: safe.status });
  }
  if (!definition) {
    if (!raw.trim()) definition = createGeneratedAppFallback(prompt);
    else try {
      definition = validateGeneratedAppDefinition(JSON.parse(stripGeneratedJsonFences(raw)));
    } catch (error) {
      console.warn("[ai-template-builder] Gemini returned an alternate JSON shape; using a validated generated fallback", { model, message: error instanceof Error ? error.message : String(error) });
      definition = createGeneratedAppFallback(prompt);
    }
  }
  const state = initialGeneratedAppState(definition);
  try {
    const [row] = await db.insert(generatedApps).values({ userId: user.id, prompt, definition, state }).returning();
    return Response.json({ app: { id: row.id, prompt: row.prompt, definition, state, sidebarPosition: row.sidebarPosition, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ai-template-builder] Saving generated app failed", { userId: user.id, message: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Your app was generated but could not be saved. Please try again." }, { status: 500 });
  }
}
