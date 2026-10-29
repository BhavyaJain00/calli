import { prisma } from "@/lib/db";
import { apiError, json } from "@/lib/api";
import { deviceFromRequest } from "@/lib/device-auth";

// The app calls this on every sync: it validates the device token, reports the
// app version, and marks the device as online for the admin's Devices page.
export async function GET(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return apiError("Invalid or revoked device token", 401);
  if (device.user && !device.user.active) {
    return apiError("This account has been disabled", 403);
  }

  const appVersion = req.headers.get("x-app-version")?.slice(0, 40) || undefined;
  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date(), ...(appVersion ? { appVersion } : {}) },
  });

  return json({
    device: { id: device.id, label: device.label, phoneNumber: device.phoneNumber },
    user: device.user ? { name: device.user.name, email: device.user.email } : null,
    org: device.org,
    serverTime: new Date().toISOString(),
  });
}

// Sign-out from the app: the phone revokes its own token. Calls it already
// uploaded are kept.
export async function DELETE(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return apiError("Invalid or revoked device token", 401);
  await prisma.device.delete({ where: { id: device.id } });
  return json({ ok: true });
}
