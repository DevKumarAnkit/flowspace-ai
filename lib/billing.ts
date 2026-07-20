import "server-only";

import { auth } from "@clerk/nextjs/server";

const proFeature = process.env.CLERK_PRO_FEATURE ?? "pro_user";

export async function hasProAccess() {
  const { userId, has } = await auth();
  return Boolean(userId && has({ feature: `user:${proFeature}` as `user:${string}` }));
}

export async function requireProAccess() {
  if (!(await hasProAccess())) throw new Error("A Flowspace Pro subscription is required for this feature.");
}
