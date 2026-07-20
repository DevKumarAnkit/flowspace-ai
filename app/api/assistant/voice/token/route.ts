import { currentUser } from "@clerk/nextjs/server";

export const runtime = "nodejs";

export async function POST() {
  if (!(await currentUser())) return Response.json({ error: "You must be signed in to use voice." }, { status: 401 });
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const agentId = process.env.ASSEMBLYAI_VOICE_AGENT_ID;
  if (!apiKey) return Response.json({ error: "Voice Assistant is not configured yet." }, { status: 503 });
  try {
    const url = new URL("https://agents.assemblyai.com/v1/token");
    url.searchParams.set("expires_in_seconds", "60");
    url.searchParams.set("max_session_duration_seconds", "900");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { token?: string };
    if (!response.ok || !data.token) return Response.json({ error: "Unable to start a secure voice session." }, { status: 502 });
    return Response.json({
      token: data.token,
      agentId: agentId ?? null,
      session: agentId ? undefined : {
        system_prompt: "You are Bulbul, Flowspace's warm, efficient female voice assistant. Start every new call with: Hello, I am Bulbul. How can I help you? Have a natural two-way conversation. Ask one concise follow-up question whenever a task, reminder, note, board, whiteboard, template, or settings request is missing required details. Before any workspace change, clearly summarize it and ask the user to confirm. Keep replies short and conversational.",
        greeting: "Hello, I am Bulbul. How can I help you?",
        voice: { voice_id: "ivy" },
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Unable to reach the voice service." }, { status: 502 }); }
}
