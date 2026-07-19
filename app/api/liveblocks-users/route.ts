import { resolveLiveblocksUsers } from "@/lib/liveblocks-server";
import { requireDatabaseUser } from "@/lib/require-database-user";

export async function POST(request: Request) {
  try {
    await requireDatabaseUser("collaboration");
    const body = await request.json() as { userIds?: unknown };
    const userIds = Array.isArray(body.userIds) ? body.userIds.filter((id): id is string => typeof id === "string").slice(0, 100) : [];
    return Response.json(await resolveLiveblocksUsers(userIds), { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to resolve collaborators." }, { status: 401 });
  }
}
