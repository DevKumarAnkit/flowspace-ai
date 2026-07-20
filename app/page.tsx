import { AppShell } from "@/components/app-shell";
import { DashboardContent } from "@/components/dashboard-content";
import { getDashboardData } from "@/app/dashboard/actions";

export default async function Home() {
  const data = await getDashboardData();
  return <AppShell title="Dashboard"><DashboardContent data={data} /></AppShell>;
}
