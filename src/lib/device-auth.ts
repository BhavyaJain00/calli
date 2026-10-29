import { prisma } from "./db";
import { hashToken } from "./tokens";

// Resolves the device for an `Authorization: Bearer <device token>` header.
export async function deviceFromRequest(req: Request) {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  return prisma.device.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { select: { id: true, name: true, email: true, active: true } },
      org: { select: { id: true, name: true } },
    },
  });
}
