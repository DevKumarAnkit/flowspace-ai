import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { NotesPage } from "@/components/notes/notes-page";
import { getNotesData } from "@/app/notes/actions";

export const dynamic = "force-dynamic";

export default async function NotesRoute({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  if (!(await currentUser())) redirect("/sign-in");
  const [notes, params] = await Promise.all([getNotesData(), searchParams]);
  const requested = Number(params.note);
  const selectedNoteId = notes.some((note) => note.id === requested) ? requested : notes.find((note) => !note.trashedAt)?.id ?? null;
  return (
    <AppShell title="Notes">
      <NotesPage initialNotes={notes} initialSelectedNoteId={selectedNoteId} />
    </AppShell>
  );
}
