import { currentUser } from "@clerk/nextjs/server";
import { appendAssistantMessage, createAssistantConversation, getAssistantConversation } from "@/lib/assistant-server";

export async function POST(request: Request) {
  if (!(await currentUser())) return Response.json({ error: "You must be signed in." }, { status: 401 });
  try {
    const body = await request.json() as { conversationId?: unknown; role?: unknown; content?: unknown };
    if (body.role !== "user" && body.role !== "assistant") throw new Error("Invalid message role.");
    if (typeof body.content !== "string" || !body.content.trim() || body.content.length > 4_000) throw new Error("Invalid message content.");
    const conversation = typeof body.conversationId === "number" ? await getAssistantConversation(body.conversationId) : await createAssistantConversation();
    if (!conversation) throw new Error("Conversation not found.");
    const message = await appendAssistantMessage(conversation.id, body.role, body.content.trim());
    return Response.json({ conversationId: conversation.id, message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to save voice transcript." }, { status: 400 }); }
}
