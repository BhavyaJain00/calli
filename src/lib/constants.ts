export const ROLES = ["ADMIN", "AGENT"] as const;
export type Role = (typeof ROLES)[number];

export const CALL_DIRECTIONS = ["INBOUND", "OUTBOUND", "MISSED"] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const CALL_STATUSES = [
  "RECEIVED",
  "TRANSCRIBING",
  "COMPLETED",
  "FAILED",
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const TRANSCRIPT_STATUSES = ["PENDING", "DONE", "FAILED", "SKIPPED"] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

export const SESSION_COOKIE = "calliser_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
