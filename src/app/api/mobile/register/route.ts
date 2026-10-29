import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { mobileRegisterSchema } from "@/lib/validation";
import { apiError, json } from "@/lib/api";
import { generateDeviceToken, hashToken } from "@/lib/tokens";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

// Called by the Android app when an agent signs in. Verifies their Calliser
// credentials and issues a device token that the app uses to upload calls.
// The plaintext token is returned once and stored only on the phone.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = mobileRegisterSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    const first = Object.values(issues).flat()[0];
    return apiError(first || "Invalid sign-in details", 400, { issues });
  }
  const data = parsed.data;

  const emailKey = `mobile:email:${data.email}`;
  for (const [key, limit] of [
    [emailKey, 10],
    [`mobile:ip:${clientIp(req)}`, 50],
  ] as const) {
    const limited = await rateLimit(key, limit, 15 * 60);
    if (!limited.ok) return apiError("Too many sign-in attempts. Try again later.", 429);
  }

  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { org: { select: { id: true, name: true } } },
  });
  if (!user || !user.active || !(await verifyPassword(data.password, user.passwordHash))) {
    return apiError("Invalid email or password", 401);
  }
  await clearRateLimit(emailKey);

  const token = generateDeviceToken();
  const device = await prisma.device.create({
    data: {
      orgId: user.orgId,
      userId: user.id,
      label: data.deviceLabel,
      phoneNumber: data.phoneNumber || user.phoneNumber || null,
      platform: data.platform,
      appVersion: data.appVersion || null,
      tokenHash: hashToken(token),
      consentAcceptedAt: new Date(),
      lastSeenAt: new Date(),
    },
    select: { id: true, label: true, phoneNumber: true },
  });

  return json(
    {
      token,
      device,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      org: user.org,
    },
    201
  );
}
