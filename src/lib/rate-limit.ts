import { prisma } from "./db";

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

// Fixed-window limiter backed by the database, so it holds across server
// instances. Good enough for brute-force protection on sign-in endpoints.
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);

  try {
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    if (!row || row.resetAt <= now) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return { ok: true };
    }
    if (row.count >= limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)),
      };
    }
    await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return { ok: true };
  } catch (err) {
    // Never lock everyone out because the limiter itself failed.
    console.error("[rate-limit] check failed:", err);
    return { ok: true };
  }
}

export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.delete({ where: { key } }).catch(() => undefined);
}
