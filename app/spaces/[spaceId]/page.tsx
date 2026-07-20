import { currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SpacePageList } from "@/components/spaces/space-page-list";
import { getSpaceData, getSpacesData } from "@/app/spaces/actions";

export const dynamic = "force-dynamic";

export default async function SpaceRoute({ params }: { params: Promise<{ spaceId: string }> }) {
  if (!(await currentUser())) redirect("/sign-in");
  const id = Number((await params).spaceId);
  if (!Number.isInteger(id) || id < 1) notFound();
  try {
    const [space, allSpaces] = await Promise.all([getSpaceData(id), getSpacesData()]);
    return <AppShell title={space.name}><SpacePageList initialSpace={space} activeSpaces={allSpaces.filter((entry) => !entry.archivedAt)} /></AppShell>;
  } catch (error) {
    if (error instanceof Error && error.message === "Space not found.") notFound();
    throw error;
  }
}
