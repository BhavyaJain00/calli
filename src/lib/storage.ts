// Recording storage with two drivers:
//   - "supabase": private Supabase Storage bucket (use for cloud deployments)
//   - "local":    files on the server's disk (single-server / VPS / Docker)
// Stored references are prefixed with the driver ("supabase:2026/10/x.m4a").
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { RECORDINGS_DIR, storageDriver, supabaseStorage } from "./env";

const EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/3gpp": "3gp",
};

export function extensionForMime(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? "bin";
}

export function isAudioMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("audio/") || mime === "video/3gpp";
}

function parseRef(ref: string): { driver: "supabase" | "local"; key: string } {
  if (ref.startsWith("supabase:")) return { driver: "supabase", key: ref.slice(9) };
  if (ref.startsWith("local:")) return { driver: "local", key: ref.slice(6) };
  return { driver: "local", key: ref };
}

function newKey(mime: string): string {
  const now = new Date();
  return [
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${crypto.randomUUID()}.${extensionForMime(mime)}`,
  ].join("/");
}

// ---------------------------------------------------------------- public API

export async function saveRecording(buffer: Buffer, mime: string): Promise<string> {
  const key = newKey(mime);
  if (storageDriver() === "supabase") {
    await supabaseUpload(key, buffer, mime);
    return `supabase:${key}`;
  }
  const abs = localPath(key);
  if (!abs) throw new Error("Invalid recording path");
  await fsp.mkdir(path.dirname(/*turbopackIgnore: true*/ abs), { recursive: true });
  await fsp.writeFile(/*turbopackIgnore: true*/ abs, buffer);
  return `local:${key}`;
}

// Loads the whole recording (used for transcription).
export async function readRecording(ref: string): Promise<Buffer | null> {
  const { driver, key } = parseRef(ref);
  if (driver === "supabase") return supabaseDownload(key);
  const abs = localPath(key);
  if (!abs) return null;
  try {
    return await fsp.readFile(/*turbopackIgnore: true*/ abs);
  } catch {
    return null;
  }
}

export async function deleteRecording(ref: string): Promise<void> {
  const { driver, key } = parseRef(ref);
  if (driver === "supabase") {
    await supabaseRequest(`/object/${supabaseStorage.bucket}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    }).catch(() => undefined);
    return;
  }
  const abs = localPath(key);
  if (abs) await fsp.rm(/*turbopackIgnore: true*/ abs, { force: true });
}

// Builds the HTTP response that plays a recording in the browser.
// Supabase: redirect to a short-lived signed URL (supports seeking natively).
// Local: stream from disk with HTTP Range support so the player can seek.
export async function recordingResponse(
  ref: string,
  mime: string,
  rangeHeader: string | null
): Promise<Response> {
  const { driver, key } = parseRef(ref);

  if (driver === "supabase") {
    const signed = await supabaseSignedUrl(key, 600);
    return new Response(null, {
      status: 302,
      headers: { Location: signed, "Cache-Control": "private, no-store" },
    });
  }

  const abs = localPath(key);
  if (!abs) return new Response("Not found", { status: 404 });
  let size: number;
  try {
    size = (await fsp.stat(/*turbopackIgnore: true*/ abs)).size;
  } catch {
    return new Response("Recording file missing", { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };

  const range = parseRange(rangeHeader, size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const stream = fs.createReadStream(/*turbopackIgnore: true*/ abs, { start, end });
  const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}

// ---------------------------------------------------------------- local disk

function localRoot(): string {
  return path.isAbsolute(RECORDINGS_DIR)
    ? RECORDINGS_DIR
    : path.join(/*turbopackIgnore: true*/ process.cwd(), RECORDINGS_DIR);
}

// Resolves a key under the recordings root, refusing path traversal.
function localPath(key: string): string | null {
  const base = path.resolve(/*turbopackIgnore: true*/ localRoot());
  const abs = path.resolve(/*turbopackIgnore: true*/ base, key);
  if (!abs.startsWith(base + path.sep)) return null;
  return abs;
}

function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    // Suffix range: last N bytes.
    const n = Number(match[2]);
    if (!n) return "invalid";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

// ---------------------------------------------------------- supabase storage

let bucketReady = false;

async function supabaseRequest(pathname: string, init: RequestInit = {}): Promise<Response> {
  const { url, secretKey } = supabaseStorage;
  if (!url || !secretKey) {
    throw new Error("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)");
  }
  return fetch(`${url}/storage/v1${pathname}`, {
    ...init,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const { bucket } = supabaseStorage;
  const existing = await supabaseRequest(`/bucket/${bucket}`);
  if (existing.ok) {
    bucketReady = true;
    return;
  }
  const created = await supabaseRequest(`/bucket`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: false }),
  });
  if (!created.ok && created.status !== 409) {
    const detail = await created.text().catch(() => "");
    throw new Error(`Could not create storage bucket "${bucket}": ${detail.slice(0, 200)}`);
  }
  bucketReady = true;
}

async function supabaseUpload(key: string, buffer: Buffer, mime: string): Promise<void> {
  await ensureBucket();
  const res = await supabaseRequest(`/object/${supabaseStorage.bucket}/${key}`, {
    method: "POST",
    headers: { "content-type": mime, "x-upsert": "false" },
    body: Uint8Array.from(buffer),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Recording upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

async function supabaseDownload(key: string): Promise<Buffer | null> {
  const res = await supabaseRequest(`/object/${supabaseStorage.bucket}/${key}`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function supabaseSignedUrl(key: string, expiresIn: number): Promise<string> {
  const res = await supabaseRequest(`/object/sign/${supabaseStorage.bucket}/${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(`Could not sign recording URL (${res.status})`);
  const data = (await res.json()) as { signedURL?: string };
  if (!data.signedURL) throw new Error("Storage did not return a signed URL");
  return `${supabaseStorage.url}/storage/v1${data.signedURL}`;
}
