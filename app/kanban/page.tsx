import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { KanbanPage } from "@/components/kanban/kanban-page";
import { getKanbanData } from "@/app/kanban/actions";

export const dynamic = "force-dynamic";

export default async function KanbanRoute({ searchParams }: { searchParams: Promise<{ board?: string }> }) {
  if (!(await currentUser())) redirect("/sign-in");
  const [data, params] = await Promise.all([getKanbanData(), searchParams]);
  const requested = Number(params.board);
  const selectedBoardId = data.boards.some((board) => board.id === requested) ? requested : data.boards[0]?.id ?? null;
  const initialToday = new Date().toISOString().slice(0, 10);
  return (
    <AppShell title="Task / Kanban">
      <KanbanPage initialData={data} initialSelectedBoardId={selectedBoardId} initialToday={initialToday} />
    </AppShell>
  );
}
