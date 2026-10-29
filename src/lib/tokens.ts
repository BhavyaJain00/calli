import crypto from "crypto";

// Device ingest tokens: a long random string shown once, stored hashed.
export function generateDeviceToken(): string {
  // 32 random bytes -> 43-char url-safe base64 string.
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
