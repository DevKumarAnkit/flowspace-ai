import { currentUser } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { syncUser } from "@/lib/sync-user";

export async function GET(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  await syncUser(user);

  return NextResponse.redirect(new URL("/", request.url));
}
