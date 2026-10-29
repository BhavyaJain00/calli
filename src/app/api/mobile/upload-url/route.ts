import { apiError, json } from "@/lib/api";
import { deviceFromRequest } from "@/lib/device-auth";
import { uploadUrlSchema } from "@/lib/validation";
import { MAX_UPLOAD_BYTES } from "@/lib/env";
import { createDirectUpload, directUploadAvailable, isAudioMime, normalizeMime } from "@/lib/storage";

// Gives the phone a signed URL to upload one recording straight to storage.
// The phone then calls /api/ingest with the returned `key`.
export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return apiError("Invalid or revoked device token", 401);
  if (device.user && !device.user.active) return apiError("This account has been disabled", 403);
  if (!directUploadAvailable()) {
    return apiError("Direct upload is not available; send the recording to /api/ingest", 409);
  }

  const parsed = uploadUrlSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid upload request", 400);
  const mime = normalizeMime(parsed.data.mime);
  if (!isAudioMime(mime)) return apiError(`Unsupported recording type: ${mime}`, 415);
  if (parsed.data.sizeBytes > MAX_UPLOAD_BYTES) {
    return apiError("Recording is larger than the server limit", 413);
  }

  try {
    const upload = await createDirectUpload(`devices/${device.id}`, mime);
    return json({ ...upload, method: "PUT" });
  } catch (err) {
    console.error("[upload-url] failed:", err);
    return apiError("Recording storage is temporarily unavailable", 503);
  }
}
