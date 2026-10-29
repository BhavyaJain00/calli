import { prisma } from "@/lib/db";
import { requireUser, apiError } from "@/lib/api";
import { recordingResponse } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

// Streams a call recording to a signed-in user who is allowed to see the call.
export async function GET(req: Request, { params }: Ctx) {
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
    select: { recordingPath: true, recordingMime: true },
  });
  if (!call?.recordingPath) return apiError("Recording not found", 404);

  try {
    return await recordingResponse(
      call.recordingPath,
      call.recordingMime || "audio/mpeg",
      req.headers.get("range")
    );
  } catch (err) {
    console.error(`[recording] failed to serve call ${id}:`, err);
    return apiError("Recording is temporarily unavailable", 502);
  }
}
