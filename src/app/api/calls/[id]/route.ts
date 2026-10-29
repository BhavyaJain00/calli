import { prisma } from "@/lib/db";
import { requireUser, requireAdmin, apiError, json } from "@/lib/api";
import { deleteRecording } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
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
    include: {
      transcript: { select: { text: true, status: true, provider: true, language: true } },
      user: { select: { id: true, name: true, email: true } },
      device: { select: { id: true, label: true } },
    },
  });
  if (!call) return apiError("Call not found", 404);

  const { recordingPath, keywords, actionItems, ...rest } = call;
  return json({
    call: {
      ...rest,
      hasRecording: Boolean(recordingPath),
      keywords: keywords ? keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
      actionItems: parseList(actionItems),
    },
  });
}

// Permanently deletes a call, its transcript and its recording (admins only),
// e.g. to honour a customer's data-deletion request.
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const call = await prisma.call.findFirst({
    where: { id, orgId: auth.user.orgId },
    select: { id: true, recordingPath: true },
  });
  if (!call) return apiError("Call not found", 404);

  if (call.recordingPath) await deleteRecording(call.recordingPath);
  await prisma.call.delete({ where: { id: call.id } });
  return json({ ok: true });
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
