import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { WhiteboardPage } from "@/components/whiteboard/whiteboard-page";
import { getWhiteboardsAction } from "@/app/whiteboard/actions";

export const dynamic = "force-dynamic";

export default async function WhiteboardRoute({ searchParams }: { searchParams: Promise<{ board?: string }> }) {
  if (!(await currentUser())) redirect("/sign-in");
  const [boards, params] = await Promise.all([getWhiteboardsAction(), searchParams]);
  const requested = Number(params.board);
  const selectedBoardId = boards.some((board) => board.id === requested) ? requested : boards[0]?.id ?? null;
  return <AppShell title="Whiteboard"><WhiteboardPage initialBoards={boards} initialSelectedBoardId={selectedBoardId} /></AppShell>;
}
