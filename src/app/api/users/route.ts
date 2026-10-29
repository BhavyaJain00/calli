import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireAdmin, apiError, json } from "@/lib/api";
import { createUserSchema } from "@/lib/validation";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const users = await prisma.user.findMany({
    where: { orgId: auth.user.orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phoneNumber: true,
      active: true,
      createdAt: true,
      _count: { select: { calls: true } },
    },
  });

  return json({ users });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const { name, email, password, role, phoneNumber } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return apiError("A user with that email already exists", 409);
  }

  const user = await prisma.user.create({
    data: {
      orgId: auth.user.orgId,
      name,
      email,
      role,
      phoneNumber: phoneNumber || null,
      passwordHash: await hashPassword(password),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phoneNumber: true,
      active: true,
      createdAt: true,
    },
  });

  return json({ user }, 201);
}
