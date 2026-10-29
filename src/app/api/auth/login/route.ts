import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { apiError, json } from "@/lib/api";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import type { Role } from "@/lib/constants";

const WINDOW_SEC = 15 * 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Enter a valid email and password", 400);
  }
  const { email, password } = parsed.data;

  const ip = clientIp(req);
  const emailKey = `login:email:${email}`;
  for (const [key, limit] of [
    [emailKey, 10],
    [`login:ip:${ip}`, 50],
  ] as const) {
    const limited = await rateLimit(key, limit, WINDOW_SEC);
    if (!limited.ok) {
      return apiError("Too many sign-in attempts. Try again later.", 429, {
        retryAfterSec: limited.retryAfterSec,
      });
    }
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return apiError("Invalid email or password", 401);
  }

  await clearRateLimit(emailKey);
  const token = await createSessionToken({
    sub: user.id,
    orgId: user.orgId,
    role: user.role as Role,
    email: user.email,
    name: user.name,
  });
  await setSessionCookie(token);

  return json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
