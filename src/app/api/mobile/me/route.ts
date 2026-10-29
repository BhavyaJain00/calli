import { prisma } from "@/lib/db";
import { apiError, json } from "@/lib/api";
import { deviceFromRequest } from "@/lib/device-auth";
import { directUploadAvailable } from "@/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/env";

// The app calls this at the start of every sync. It validates the device
// token, records the app version and the phone's recording check, marks the
// device online, and tells the app how to upload recordings.
export async function GET(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return apiError("Invalid or revoked device token", 401);
  if (device.user && !device.user.active) {
    return apiError("This account has been disabled", 403);
  }

  const appVersion = req.headers.get("x-app-version")?.slice(0, 40);
  const dialerApp = req.headers.get("x-dialer-app")?.slice(0, 120);
  const visibleHeader = req.headers.get("x-recordings-visible");
  const recordingsVisible =
    visibleHeader !== null && /^\d+$/.test(visibleHeader) ? Number(visibleHeader) : undefined;

  await prisma.device.update({
    where: { id: device.id },
    data: {
      lastSeenAt: new Date(),
      ...(appVersion ? { appVersion } : {}),
      ...(dialerApp ? { dialerApp } : {}),
      ...(recordingsVisible !== undefined ? { recordingsVisible } : {}),
    },
  });

  return json({
    device: { id: device.id, label: device.label, phoneNumber: device.phoneNumber },
    user: device.user ? { name: device.user.name, email: device.user.email } : null,
    org: device.org,
    upload: { mode: directUploadAvailable() ? "direct" : "multipart", maxBytes: MAX_UPLOAD_BYTES },
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
