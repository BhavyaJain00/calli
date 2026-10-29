import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";

export function json(data: unknown, init?: number | ResponseInit) {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data as object, responseInit);
}

export function apiError(message: string, status = 400, extra?: object) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

type AwaitedUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

type Guard =
  | { ok: true; user: AwaitedUser }
  | { ok: false; response: NextResponse };

// Use at the top of a route handler:
//   const auth = await requireUser();
//   if (!auth.ok) return auth.response;
//   const { user } = auth;
export async function requireUser(): Promise<Guard> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: apiError("Not authenticated", 401) };
  }
  return { ok: true, user };
}

export async function requireAdmin(): Promise<Guard> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (auth.user.role !== "ADMIN") {
    return { ok: false, response: apiError("Admin access required", 403) };
  }
  return auth;
}
