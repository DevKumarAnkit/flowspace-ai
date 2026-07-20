import { currentUser } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { syncUser } from "@/lib/sync-user";

export async function GET(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/log-in", request.url));
  }

  await syncUser(user);

  const next = request.nextUrl.searchParams.get("next");
  return NextResponse.redirect(new URL(next === "/checkout" ? next : "/dashboard", request.url));
}
