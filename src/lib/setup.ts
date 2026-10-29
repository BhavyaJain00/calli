import { prisma } from "./db";

// True until the first account exists. Drives the one-time /setup flow.
export async function needsSetup(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}
