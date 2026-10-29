import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { formatDuration, formatDateTime } from "@/lib/format";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isAdmin = user.role === "ADMIN";
  const scope: Prisma.CallWhereInput = isAdmin
    ? { orgId: user.orgId }
    : { orgId: user.orgId, userId: user.id };

  const [total, durationAgg, positive, negative, agents, recent] =
    await Promise.all([
      prisma.call.count({ where: scope }),
      prisma.call.aggregate({ where: scope, _sum: { durationSec: true } }),
      prisma.call.count({ where: { ...scope, sentiment: "positive" } }),
      prisma.call.count({ where: { ...scope, sentiment: "negative" } }),
      isAdmin
        ? prisma.user.count({ where: { orgId: user.orgId, role: "AGENT" } })
        : Promise.resolve(0),
      prisma.call.findMany({
        where: scope,
        orderBy: { startedAt: "desc" },
        take: 6,
        select: {
          id: true,
          direction: true,
          toNumber: true,
          fromNumber: true,
          contactName: true,
          startedAt: true,
          durationSec: true,
          sentiment: true,
          status: true,
          user: { select: { name: true } },
        },
      }),
    ]);

  const totalDuration = durationAgg._sum.durationSec ?? 0;

  const stats = [
    { label: "Total calls", value: String(total) },
    { label: "Talk time", value: formatDuration(totalDuration) },
    { label: "Positive", value: String(positive) },
    { label: "Negative", value: String(negative) },
    ...(isAdmin ? [{ label: "Sales agents", value: String(agents) }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? "Organisation-wide call activity and AI insights."
            : "Your call activity and AI insights."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-2xl font-semibold">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold">Recent calls</h2>
          <Link
            href="/dashboard/calls"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all →
          </Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {recent.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-slate-500">
              No calls yet.{" "}
              <Link href="/dashboard/mobile" className="font-medium text-brand-600">
                Install the Calliser app on your phone
              </Link>{" "}
              and calls will appear here automatically.
            </li>
          )}
          {recent.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/calls/${c.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
              >
                <Badge value={c.direction} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {c.contactName ||
                      (c.direction === "INBOUND" ? c.fromNumber : c.toNumber)}
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {isAdmin && c.user ? `${c.user.name} · ` : ""}
                    {formatDateTime(c.startedAt)} · {formatDuration(c.durationSec)}
                  </div>
                </div>
                <Badge value={c.sentiment} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
