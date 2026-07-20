"use client";

import type { CustomAuthenticationResult } from "@liveblocks/core";

type CachedAuthentication = {
  expiresAt: number;
  request: Promise<CustomAuthenticationResult>;
};

const authenticationCache = new Map<string, CachedAuthentication>();
const AUTH_CACHE_MS = 30_000;

export function getLiveblocksAuthentication(room?: string): Promise<CustomAuthenticationResult> {
  const cacheKey = room ?? "__notifications__";
  const cached = authenticationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  const request = fetch("/api/liveblocks-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room }),
    cache: "no-store",
  }).then(async (response) => {
    const result = await response.json().catch(() => ({})) as CustomAuthenticationResult & { error?: string };
    if (!response.ok) throw new Error(result.error || "Unable to connect page collaboration.");
    return result;
  }).catch((error) => {
    authenticationCache.delete(cacheKey);
    throw error;
  });

  authenticationCache.set(cacheKey, { expiresAt: Date.now() + AUTH_CACHE_MS, request });
  return request;
}
