import { ClerkProvider } from '@clerk/nextjs';
import "@liveblocks/react-ui/styles.css";
import "./globals.css";
import type { Metadata } from "next";
import { FlowspaceLiveblocksProvider } from "@/components/liveblocks-provider";
import { cookies } from "next/headers";
import type { ThemePreference } from "@/lib/settings-domain";

export const metadata: Metadata = {
  title: "Flowspace — Your ideas, in motion",
  description: "A calm, visual workspace for notes, tasks, pages, and ideas.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const storedTheme = (await cookies()).get("flowspace-theme")?.value;
  const theme: ThemePreference = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
  return (
    <ClerkProvider>
      <html lang="en" data-theme={theme} suppressHydrationWarning>
        <body>
          <FlowspaceLiveblocksProvider>{children}</FlowspaceLiveblocksProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
