import { prisma } from "@/lib/db";
import { requireAdmin, apiError, json } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const device = await prisma.device.findFirst({
    where: { id, orgId: auth.user.orgId },
  });
  if (!device) return apiError("Device not found", 404);

  // Revoke by deleting; calls already ingested keep their (now null) deviceId.
  await prisma.device.delete({ where: { id: device.id } });
  return json({ ok: true });
}
