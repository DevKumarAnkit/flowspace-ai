import { AppShell } from "@/components/app-shell";
import { SpacesPage } from "@/components/spaces/spaces-page";
import { getSpacesData } from "@/app/spaces/actions";

export const dynamic = "force-dynamic";

export default async function SpacesRoute() {
  return <AppShell title="Pages & Spaces"><SpacesPage initialSpaces={await getSpacesData()} /></AppShell>;
}
