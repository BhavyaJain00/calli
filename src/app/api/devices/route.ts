import { prisma } from "@/lib/db";
import { requireAdmin, apiError, json } from "@/lib/api";
import { createDeviceSchema } from "@/lib/validation";
import { generateDeviceToken, hashToken } from "@/lib/tokens";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const devices = await prisma.device.findMany({
    where: { orgId: auth.user.orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      phoneNumber: true,
      platform: true,
      appVersion: true,
      consentAcceptedAt: true,
      lastSeenAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { calls: true } },
    },
  });

  return json({ devices });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = createDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const { label, userId, phoneNumber, platform } = parsed.data;

  if (userId) {
    const owner = await prisma.user.findFirst({
      where: { id: userId, orgId: auth.user.orgId },
    });
    if (!owner) return apiError("Assigned user not found", 400);
  }

  // Generate the token, store only its hash. Plaintext is returned once.
  const token = generateDeviceToken();
  const device = await prisma.device.create({
    data: {
      orgId: auth.user.orgId,
      label,
      userId: userId || null,
      phoneNumber: phoneNumber || null,
      platform,
      tokenHash: hashToken(token),
    },
    select: { id: true, label: true, platform: true, createdAt: true },
  });

  return json(
    {
      device,
      // Show this once; it cannot be retrieved again.
      ingestToken: token,
      note: "Store this token in the companion app. It is shown only once.",
    },
    201
  );
}
