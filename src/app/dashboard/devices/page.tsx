import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DevicesManager } from "@/components/DevicesManager";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") redirect("/dashboard");

  const agents = await prisma.user.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Devices</h1>
        <p className="text-sm text-slate-500">
          Register the companion app on an agent&apos;s phone or a VoIP line.
          Calls uploaded by a device are attributed to its assigned agent.
        </p>
      </div>
      <DevicesManager agents={agents} />
    </div>
  );
}
