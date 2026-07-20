import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssistantPage } from "@/components/assistant/assistant-page";
import { getAssistantConversation } from "@/lib/assistant-server";

export const dynamic = "force-dynamic";

export default async function AssistantRoute() {
  if (!(await currentUser())) redirect("/sign-in");
  return <AppShell title="AI Assistant"><AssistantPage initialConversation={await getAssistantConversation()} /></AppShell>;
}
