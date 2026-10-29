import { z } from "zod";
import { CALL_DIRECTIONS } from "./constants";

// Emails are stored lowercase so sign-in is case-insensitive.
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));
const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);
const optionalPhone = z.string().trim().max(40).optional().or(z.literal(""));

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const setupSchema = z.object({
  setupToken: z.string().optional(),
  orgName: z.string().trim().min(1, "Company name is required").max(120),
  name: z.string().trim().min(1, "Your name is required").max(120),
  email,
  password: newPassword,
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email,
  password: newPassword,
  role: z.enum(["ADMIN", "AGENT"]).default("AGENT"),
  phoneNumber: optionalPhone,
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "AGENT"]).optional(),
  phoneNumber: optionalPhone,
  active: z.boolean().optional(),
  password: newPassword.optional(),
});

export const createDeviceSchema = z.object({
  label: z.string().trim().min(1).max(120),
  userId: z.string().min(1).optional().or(z.literal("")),
  phoneNumber: optionalPhone,
  platform: z.enum(["android", "ios", "voip"]).default("android"),
});

// Sign-in from the Android companion app. Consent is mandatory: the agent
// confirms call participants are told calls may be recorded.
export const mobileRegisterSchema = z.object({
  email,
  password: z.string().min(1).max(200),
  deviceLabel: z.string().trim().min(1).max(120),
  phoneNumber: z.string().trim().max(40).optional(),
  platform: z.enum(["android", "ios"]).default("android"),
  appVersion: z.string().trim().max(40).optional(),
  consent: z.literal(true, { error: "Recording consent must be confirmed" }),
});

// Call metadata uploaded by a device (JSON body or the `meta` multipart field).
export const ingestSchema = z.object({
  externalId: z.string().max(200).optional(),
  direction: z.enum(CALL_DIRECTIONS).default("OUTBOUND"),
  fromNumber: z.string().trim().min(1).max(40),
  toNumber: z.string().trim().min(1).max(40),
  contactName: z.string().trim().max(200).optional(),
  // Parsed and validated as a date in the route.
  startedAt: z.string().min(1),
  durationSec: z.coerce.number().int().min(0).max(60 * 60 * 24).default(0),
  consent: z.boolean().optional(),
});
