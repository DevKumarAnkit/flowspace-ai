import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getGeneratedAppsAction } from "@/app/ai-template-builder/actions";
import { AppShell } from "@/components/app-shell";
import { TemplateBuilderPage } from "@/components/ai-template-builder/template-builder-page";

export const dynamic = "force-dynamic";
export default async function AiTemplateBuilderRoute() {
  if (!(await currentUser())) redirect("/sign-in");
  return <AppShell title="AI Template Builder"><TemplateBuilderPage initialApps={await getGeneratedAppsAction()} /></AppShell>;
}
