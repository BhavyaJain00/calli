// Edge-safe JWT helpers. This module must NOT import Prisma or next/headers so
// it can be used from middleware (Edge runtime) as well as from Node routes.
import { SignJWT, jwtVerify } from "jose";
import { getAuthSecret } from "./env";
import { SESSION_MAX_AGE_SECONDS, type Role } from "./constants";

export type SessionPayload = {
  sub: string; // user id
  orgId: string;
  role: Role;
  email: string;
  name: string;
};

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (
      typeof payload.sub === "string" &&
      typeof payload.orgId === "string" &&
      typeof payload.role === "string" &&
      typeof payload.email === "string"
    ) {
      return {
        sub: payload.sub,
        orgId: payload.orgId as string,
        role: payload.role as Role,
        email: payload.email as string,
        name: (payload.name as string) ?? "",
      };
    }
    return null;
  } catch {
    return null;
  }
}
