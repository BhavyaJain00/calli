import { after } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, json } from "@/lib/api";
import { ingestSchema } from "@/lib/validation";
import { isAudioMime, saveRecording } from "@/lib/storage";
import { processCall } from "@/lib/pipeline";
import { deviceFromRequest } from "@/lib/device-auth";
import { MAX_UPLOAD_BYTES } from "@/lib/env";

export const runtime = "nodejs";
// Leaves time for transcription + summary, which run after the response.
export const maxDuration = 300;

// Upload endpoint for the companion app (and VoIP integrations).
//   Authorization: Bearer <device token>
// Body is either:
//   - multipart/form-data: `meta` (JSON) + optional `recording` (audio file)
//   - application/json: metadata only
// Re-sending the same `externalId` from the same device is idempotent.
export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return apiError("Invalid or revoked device token", 401);
  if (device.user && !device.user.active) {
    return apiError("This account has been disabled", 403);
  }

  const declaredSize = Number(req.headers.get("content-length") || 0);
  if (declaredSize > MAX_UPLOAD_BYTES + 64 * 1024) {
    return apiError("Upload is larger than the server limit", 413);
  }

  let metaRaw: unknown = null;
  let recording: { buffer: Buffer; mime: string } | null = null;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError("Malformed multipart body", 400);
    }
    const metaField = form.get("meta");
    metaRaw = typeof metaField === "string" ? safeJson(metaField) : null;

    const file = form.get("recording");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return apiError("Recording is larger than the server limit", 413);
      }
      const mime = (file.type || "audio/mpeg").toLowerCase();
      if (!isAudioMime(mime)) {
        return apiError(`Unsupported recording type: ${mime}`, 415);
      }
      recording = { buffer: Buffer.from(await file.arrayBuffer()), mime };
    }
  } else {
    metaRaw = await req.json().catch(() => null);
  }

  const parsed = ingestSchema.safeParse(metaRaw);
  if (!parsed.success) {
    return apiError("Invalid call metadata", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }
  const meta = parsed.data;

  const startedAt = new Date(meta.startedAt);
  if (isNaN(startedAt.getTime())) {
    return apiError("startedAt must be a valid ISO date", 400);
  }

  // A recording is only accepted once the device has confirmed that call
  // participants are informed (done at app sign-in), per law and policy.
  if (recording && !meta.consent && !device.consentAcceptedAt) {
    return apiError("Recording consent has not been confirmed for this device", 403);
  }
  if (meta.consent && !device.consentAcceptedAt) {
    await prisma.device.update({
      where: { id: device.id },
      data: { consentAcceptedAt: new Date() },
    });
  }

  // Skip the upload work if this exact call already has its recording.
  if (meta.externalId) {
    const existing = await prisma.call.findUnique({
      where: { deviceId_externalId: { deviceId: device.id, externalId: meta.externalId } },
      select: { id: true, recordingPath: true },
    });
    if (existing && (existing.recordingPath || !recording)) {
      await touchDevice(device.id);
      return json({ ok: true, callId: existing.id, duplicate: true });
    }
  }

  let recordingFields = {};
  if (recording) {
    let recordingPath: string;
    try {
      recordingPath = await saveRecording(recording.buffer, recording.mime);
    } catch (err) {
      console.error("[ingest] could not store recording:", err);
      // 503 tells the phone to retry later instead of dropping the recording.
      return apiError(err instanceof Error ? err.message : "Recording storage failed", 503);
    }
    recordingFields = {
      recordingPath,
      recordingMime: recording.mime,
      recordingSize: recording.buffer.length,
    };
  }

  const baseData = {
    orgId: device.orgId,
    userId: device.userId,
    deviceId: device.id,
    direction: meta.direction,
    fromNumber: meta.fromNumber,
    toNumber: meta.toNumber,
    contactName: meta.contactName || null,
    startedAt,
    durationSec: meta.durationSec,
    status: "RECEIVED",
    ...recordingFields,
  };

  const call = meta.externalId
    ? await prisma.call.upsert({
        where: { deviceId_externalId: { deviceId: device.id, externalId: meta.externalId } },
        create: { ...baseData, externalId: meta.externalId },
        // A recording that arrives after the metadata is attached to the call.
        update: { ...recordingFields, status: "RECEIVED" },
      })
    : await prisma.call.create({ data: baseData });

  await touchDevice(device.id);

  // Transcribe + summarise after responding, so the phone isn't kept waiting.
  after(() => processCall(call.id));

  return json({ ok: true, callId: call.id }, 202);
}

async function touchDevice(id: string) {
  await prisma.device.update({ where: { id }, data: { lastSeenAt: new Date() } });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
