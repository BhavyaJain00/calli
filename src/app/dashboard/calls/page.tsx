import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { CallsTable } from "@/components/CallsTable";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const isAdmin = user.role === "ADMIN";

  const agents = isAdmin
    ? await prisma.user.findMany({
        where: { orgId: user.orgId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Calls</h1>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? "Every recorded call across the team."
            : "Your recorded calls."}
        </p>
      </div>
      <CallsTable isAdmin={isAdmin} agents={agents} />
    </div>
  );
}
