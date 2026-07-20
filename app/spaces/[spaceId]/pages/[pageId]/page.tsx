import { currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SpaceDocumentEditor } from "@/components/spaces/space-document-editor";
import { getPageData } from "@/app/spaces/actions";
import { getUserSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

export default async function PageRoute({ params }: { params: Promise<{ spaceId: string; pageId: string }> }) {
  if (!(await currentUser())) redirect("/sign-in");
  const values = await params;
  const spaceId = Number(values.spaceId);
  const pageId = Number(values.pageId);
  if (!Number.isInteger(spaceId) || !Number.isInteger(pageId) || spaceId < 1 || pageId < 1) notFound();
  try {
    const [data, { settings }] = await Promise.all([getPageData(spaceId, pageId), getUserSettings()]);
    return <AppShell title={data.page.title}><SpaceDocumentEditor initialPage={data.page} space={data.space} activeSpaces={data.allSpaces} autoSave={settings.autoSave} /></AppShell>;
  } catch (error) {
    if (error instanceof Error && /Page not found|Space not found/.test(error.message)) notFound();
    throw error;
  }
}
