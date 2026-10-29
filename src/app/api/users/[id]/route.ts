import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireAdmin, apiError, json } from "@/lib/api";
import { updateUserSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const target = await prisma.user.findFirst({
    where: { id, orgId: auth.user.orgId },
  });
  if (!target) return apiError("User not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  // Guard: don't let an admin deactivate or demote themselves into lockout.
  if (target.id === auth.user.id) {
    if (parsed.data.active === false || parsed.data.role === "AGENT") {
      return apiError("You cannot deactivate or demote your own account", 400);
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.phoneNumber !== undefined)
    data.phoneNumber = parsed.data.phoneNumber || null;
  if (parsed.data.password)
    data.passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.user.update({
    where: { id: target.id },
    data,
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

  return json({ user });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  if (id === auth.user.id) {
    return apiError("You cannot delete your own account", 400);
  }

  const target = await prisma.user.findFirst({
    where: { id, orgId: auth.user.orgId },
  });
  if (!target) return apiError("User not found", 404);

  await prisma.user.delete({ where: { id: target.id } });
  return json({ ok: true });
}
