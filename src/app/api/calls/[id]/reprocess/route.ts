import { prisma } from "@/lib/db";
import { requireUser, apiError, json } from "@/lib/api";
import { processCall } from "@/lib/pipeline";

type Ctx = { params: Promise<{ id: string }> };

// Re-runs transcription + summary for a call. Awaited so the client gets a
// fresh result; for large volumes move this to a background queue.
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const { id } = await params;

  const call = await prisma.call.findFirst({
    where: {
      id,
      orgId: user.orgId,
      ...(user.role !== "ADMIN" ? { userId: user.id } : {}),
    },
    select: { id: true },
  });
  if (!call) return apiError("Call not found", 404);

  await processCall(call.id);
  return json({ ok: true });
}
