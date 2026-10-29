import { after } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, json } from "@/lib/api";
import { ingestSchema } from "@/lib/validation";
import {
  directUploadSize,
  isAudioMime,
  normalizeMime,
  saveRecording,
} from "@/lib/storage";
import { processCall } from "@/lib/pipeline";
import { deviceFromRequest } from "@/lib/device-auth";
import { MAX_UPLOAD_BYTES } from "@/lib/env";

export const runtime = "nodejs";
// Leaves time for transcription + summary, which run after the response.
export const maxDuration = 300;

// Upload endpoint for the companion app (and VoIP integrations).
//   Authorization: Bearer <device token>
// Body is one of:
//   - application/json: call metadata, optionally with `recordingKey` for audio
//     the phone already uploaded via /api/mobile/upload-url
//   - multipart/form-data: `meta` (JSON) + optional `recording` (audio file)
// Calls are keyed by the device's `externalId`, so the app can first send the
// call details and attach the recording in a later request. Re-sending is safe.
// Response: { callId, hasRecording, duplicate? }
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
  let file: { buffer: Buffer; mime: string } | null = null;

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

    const upload = form.get("recording");
    if (upload instanceof File && upload.size > 0) {
      if (upload.size > MAX_UPLOAD_BYTES) {
        return apiError("Recording is larger than the server limit", 413);
      }
      const mime = normalizeMime(upload.type);
      if (!isAudioMime(mime)) return apiError(`Unsupported recording type: ${mime}`, 415);
      file = { buffer: Buffer.from(await upload.arrayBuffer()), mime };
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

  const hasIncomingRecording = Boolean(file || meta.recordingKey);

  // A recording is only accepted once the device has confirmed that call
  // participants are informed (done at app sign-in), per law and policy.
  if (hasIncomingRecording && !meta.consent && !device.consentAcceptedAt) {
    return apiError("Recording consent has not been confirmed for this device", 403);
  }
  if (meta.consent && !device.consentAcceptedAt) {
    await prisma.device.update({
      where: { id: device.id },
      data: { consentAcceptedAt: new Date() },
    });
  }

  const existing = meta.externalId
    ? await prisma.call.findUnique({
        where: { deviceId_externalId: { deviceId: device.id, externalId: meta.externalId } },
        select: { id: true, recordingPath: true },
      })
    : null;

  // Nothing new to add to a call we already have.
  if (existing && (existing.recordingPath || !hasIncomingRecording)) {
    await touchDevice(device.id);
    return json({
      ok: true,
      callId: existing.id,
      hasRecording: Boolean(existing.recordingPath),
      duplicate: true,
    });
  }

  // Resolve where the recording lives.
  let recordingFields: { recordingPath: string; recordingMime: string; recordingSize: number | null } | null =
    null;
  if (file) {
    try {
      recordingFields = {
        recordingPath: await saveRecording(file.buffer, file.mime),
        recordingMime: file.mime,
        recordingSize: file.buffer.length,
      };
    } catch (err) {
      console.error("[ingest] could not store recording:", err);
      // 503 tells the phone to retry later instead of dropping the recording.
      return apiError(err instanceof Error ? err.message : "Recording storage failed", 503);
    }
  } else if (meta.recordingKey) {
    const key = meta.recordingKey;
    // Keys are issued per device by /api/mobile/upload-url.
    if (!key.startsWith(`devices/${device.id}/`) || key.includes("..")) {
      return apiError("Invalid recording key", 400);
    }
    const mime = normalizeMime(meta.recordingMime);
    if (!isAudioMime(mime)) return apiError(`Unsupported recording type: ${mime}`, 415);
    let size: number | null;
    try {
      size = await directUploadSize(key);
    } catch (err) {
      console.error("[ingest] could not verify upload:", err);
      return apiError("Recording storage is temporarily unavailable", 503);
    }
    if (size === null) return apiError("The uploaded recording was not found", 400);
    recordingFields = { recordingPath: `supabase:${key}`, recordingMime: mime, recordingSize: size || null };
  }

  let call: { id: string; recordingPath: string | null };
  if (existing) {
    // Attach a recording that arrived after the call details.
    call = await prisma.call.update({
      where: { id: existing.id },
      data: { ...recordingFields, status: "RECEIVED", aiError: null },
      select: { id: true, recordingPath: true },
    });
  } else {
    const data = {
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
    call = meta.externalId
      ? await prisma.call.upsert({
          where: { deviceId_externalId: { deviceId: device.id, externalId: meta.externalId } },
          create: { ...data, externalId: meta.externalId },
          update: recordingFields ? { ...recordingFields, status: "RECEIVED" } : {},
          select: { id: true, recordingPath: true },
        })
      : await prisma.call.create({ data, select: { id: true, recordingPath: true } });
  }

  await touchDevice(device.id);

  // Transcribe + summarise after responding, so the phone isn't kept waiting.
  const callId = call.id;
  after(() => processCall(callId));

  return json({ ok: true, callId, hasRecording: Boolean(call.recordingPath) }, 202);
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
