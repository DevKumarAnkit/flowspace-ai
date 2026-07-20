import { currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { getGeneratedAppAction } from "@/app/ai-template-builder/actions";
import { AppShell } from "@/components/app-shell";
import { GeneratedAppDetail } from "@/components/ai-template-builder/generated-app-detail";

export const dynamic = "force-dynamic";
export default async function GeneratedAppRoute({ params }: { params: Promise<{ appId: string }> }) {
  if (!(await currentUser())) redirect("/sign-in");
  try { const app = await getGeneratedAppAction((await params).appId); return <AppShell title={app.definition.appName}><GeneratedAppDetail app={app} /></AppShell>; }
  catch { notFound(); }
}
