import { currentUser } from "@clerk/nextjs/server";
import { confirmAssistantAction } from "@/lib/assistant-server";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ actionId: string }> }) {
  if (!(await currentUser())) return Response.json({ error: "You must be signed in." }, { status: 401 });
  const id = Number((await params).actionId);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Invalid action request." }, { status: 400 });
  try { return Response.json({ result: await confirmAssistantAction(id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to complete action." }, { status: 400 }); }
}
