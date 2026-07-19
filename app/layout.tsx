import { ClerkProvider } from '@clerk/nextjs';
import "@liveblocks/react-ui/styles.css";
import "./globals.css";
import type { Metadata } from "next";
import { FlowspaceLiveblocksProvider } from "@/components/liveblocks-provider";

export const metadata: Metadata = {
  title: "Flowspace — Your ideas, in motion",
  description: "A calm, visual workspace for notes, tasks, pages, and ideas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <FlowspaceLiveblocksProvider>{children}</FlowspaceLiveblocksProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
