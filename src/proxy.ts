import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/jwt";
import { SESSION_COOKIE } from "@/lib/constants";

// Next 16 "proxy" (formerly middleware): guards dashboard routes before render.
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const { pathname } = req.nextUrl;
  const isDashboard = pathname.startsWith("/dashboard");

  if (isDashboard && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Keep admin-only sections out of reach for agents.
  if (
    session &&
    session.role !== "ADMIN" &&
    (pathname.startsWith("/dashboard/users") ||
      pathname.startsWith("/dashboard/devices"))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && session) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
