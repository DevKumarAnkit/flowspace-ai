import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SettingsPage } from "@/components/settings/settings-page";
import { getSettingsPageData } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function SettingsRoute({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  if (!(await currentUser())) redirect("/sign-in");
  const [data, params] = await Promise.all([getSettingsPageData(), searchParams]);
  return <AppShell title="Settings"><SettingsPage initialData={data} initialSection={params.section} /></AppShell>;
}
