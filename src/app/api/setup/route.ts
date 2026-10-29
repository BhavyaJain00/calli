import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { setupSchema } from "@/lib/validation";
import { apiError, json } from "@/lib/api";
import { getSetupToken } from "@/lib/env";
import { needsSetup } from "@/lib/setup";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import crypto from "crypto";

// One-time creation of the organization and its first admin account.
export async function GET() {
  return json({
    needsSetup: await needsSetup(),
    tokenRequired: Boolean(getSetupToken()) || process.env.NODE_ENV === "production",
  });
}

export async function POST(req: Request) {
  if (!(await needsSetup())) {
    return apiError("Setup has already been completed", 403);
  }

  const limited = await rateLimit(`setup:ip:${clientIp(req)}`, 10, 15 * 60);
  if (!limited.ok) return apiError("Too many attempts. Try again later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const expected = getSetupToken();
  if (!expected && process.env.NODE_ENV === "production") {
    return apiError("SETUP_TOKEN must be set on the server before setup can run", 403);
  }
  if (expected && !safeEqual(parsed.data.setupToken ?? "", expected)) {
    return apiError("Incorrect setup token", 401);
  }

  const { orgName, name, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction so two concurrent requests can't both win.
    if ((await tx.user.count()) > 0) return null;
    const org = await tx.organization.create({ data: { name: orgName } });
    return tx.user.create({
      data: { orgId: org.id, name, email, passwordHash, role: "ADMIN" },
    });
  });
  if (!user) return apiError("Setup has already been completed", 403);

  await setSessionCookie(
    await createSessionToken({
      sub: user.id,
      orgId: user.orgId,
      role: "ADMIN",
      email: user.email,
      name: user.name,
    })
  );
  return json({ ok: true }, 201);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
