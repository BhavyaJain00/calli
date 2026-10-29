// Centralised access to environment configuration.

const isProd = process.env.NODE_ENV === "production";

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (isProd) {
      throw new Error(
        "AUTH_SECRET must be set to a random value of at least 32 characters."
      );
    }
    // Development-only fallback so a fresh checkout boots.
    return new TextEncoder().encode("dev-only-insecure-secret-not-for-production");
  }
  return new TextEncoder().encode(secret);
}

// Token required to create the first admin account on /setup.
// Required in production so a stranger can't claim a fresh deployment.
export function getSetupToken(): string | null {
  const token = process.env.SETUP_TOKEN?.trim();
  return token ? token : null;
}

export const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "storage/recordings";

export const MAX_UPLOAD_BYTES =
  Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 50) * 1024 * 1024;

// Supabase Storage for recordings (recommended for cloud deployments, where the
// server's local disk is not persistent). Falls back to local disk when unset.
export const supabaseStorage = {
  url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, ""),
  secretKey: process.env.SUPABASE_SECRET_KEY || "",
  bucket: process.env.SUPABASE_STORAGE_BUCKET || "call-recordings",
};

export function storageDriver(): "supabase" | "local" {
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "local" || explicit === "supabase") return explicit;
  return supabaseStorage.url && supabaseStorage.secretKey ? "supabase" : "local";
}
