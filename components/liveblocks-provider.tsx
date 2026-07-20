"use client";

import { LiveblocksProvider } from "@liveblocks/react/suspense";
import type { ReactNode } from "react";
import { getLiveblocksAuthentication } from "@/lib/liveblocks-client-auth";

export function FlowspaceLiveblocksProvider({ children }: { children: ReactNode }) {
  return (
    <LiveblocksProvider
      authEndpoint={getLiveblocksAuthentication}
      resolveUsers={async ({ userIds }) => {
        const response = await fetch("/api/liveblocks-users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds }),
        });
        if (!response.ok) throw new Error("Unable to resolve collaborators.");
        return response.json();
      }}
    >
      {children}
    </LiveblocksProvider>
  );
}
