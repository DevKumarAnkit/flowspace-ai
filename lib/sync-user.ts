import "server-only";

import type { User as ClerkUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function syncUser(user: ClerkUser) {
  const primaryEmail = user.emailAddresses.find(
    ({ id }) => id === user.primaryEmailAddressId,
  )?.emailAddress.toLowerCase();

  if (!primaryEmail) {
    throw new Error("The authenticated Clerk user does not have a primary email address.");
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

  await db
    .insert(users)
    .values({
      clerkId: user.id,
      name,
      email: primaryEmail,
      imageUrl: user.imageUrl,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        name,
        email: primaryEmail,
        imageUrl: user.imageUrl,
        updatedAt: new Date(),
      },
    });
}
