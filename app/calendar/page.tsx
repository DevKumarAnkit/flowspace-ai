import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CalendarPage } from "@/components/calendar/calendar-page";
import { getCalendarData } from "@/app/calendar/actions";
import { getUserSettings } from "@/lib/settings-server";

export const dynamic = "force-dynamic";

export default async function CalendarRoute() {
  if (!(await currentUser())) redirect("/sign-in");
  const [data, { settings }] = await Promise.all([getCalendarData(), getUserSettings()]);
  return (
    <AppShell title="Calendar">
      <CalendarPage initialCategories={data.categories} initialItems={data.items} defaultView={settings.defaultCalendarView} browserReminders={settings.notifications.browserReminders} />
    </AppShell>
  );
}
