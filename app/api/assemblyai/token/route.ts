import { currentUser } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const TOKEN_TTL_SECONDS = 60;
const MAX_SESSION_DURATION_SECONDS = 120;

function noStore(body: Record<string, unknown>, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function POST() {
  if (!(await currentUser())) return noStore({ error: "You must be signed in to use Speak to Note." }, { status: 401 });
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) return noStore({ error: "AssemblyAI is not configured yet." }, { status: 503 });

  try {
    const url = new URL("https://streaming.assemblyai.com/v3/token");
    url.searchParams.set("expires_in_seconds", String(TOKEN_TTL_SECONDS));
    url.searchParams.set("max_session_duration_seconds", String(MAX_SESSION_DURATION_SECONDS));
    const response = await fetch(url, { headers: { Authorization: apiKey }, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { token?: string };
    if (!response.ok || !data.token) {
      console.error("AssemblyAI token request failed", response.status);
      if (response.status === 429) return noStore({ error: "All transcription sessions are currently busy. Please try again shortly." }, { status: 429 });
      return noStore({ error: "Unable to start a secure transcription session." }, { status: 502 });
    }
    return noStore({ token: data.token, expiresInSeconds: TOKEN_TTL_SECONDS, maxSessionDurationSeconds: MAX_SESSION_DURATION_SECONDS });
  } catch (error) {
    console.error("AssemblyAI token request failed", error);
    return noStore({ error: "Unable to reach the transcription service." }, { status: 502 });
  }
}
