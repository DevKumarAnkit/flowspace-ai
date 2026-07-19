import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { syncUser } from "@/lib/sync-user";

export async function requireDatabaseUser(feature = "this feature") {
  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error(`You must be signed in to use ${feature}.`);
  await syncUser(clerkUser);
  const [databaseUser] = await db.select().from(users).where(eq(users.clerkId, clerkUser.id)).limit(1);
  if (!databaseUser) throw new Error("Unable to resolve the signed-in user.");
  return databaseUser;
}

