import { prisma } from "@/lib/db";
import { requireUser, json } from "@/lib/api";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const direction = url.searchParams.get("direction") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const sentiment = url.searchParams.get("sentiment") || undefined;
  const filterUserId = url.searchParams.get("userId") || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 20)
  );

  const where: Prisma.CallWhereInput = { orgId: user.orgId };

  // Agents are restricted to their own calls regardless of query params.
  if (user.role !== "ADMIN") {
    where.userId = user.id;
  } else if (filterUserId) {
    where.userId = filterUserId;
  }

  if (direction) where.direction = direction;
  if (status) where.status = status;
  if (sentiment) where.sentiment = sentiment;
  if (q) {
    where.OR = [
      { fromNumber: { contains: q, mode: "insensitive" } },
      { toNumber: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, calls] = await Promise.all([
    prisma.call.count({ where }),
    prisma.call.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        direction: true,
        fromNumber: true,
        toNumber: true,
        contactName: true,
        startedAt: true,
        durationSec: true,
        status: true,
        sentiment: true,
        summary: true,
        recordingPath: true,
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  return json({
    calls: calls.map((c) => ({
      ...c,
      hasRecording: Boolean(c.recordingPath),
      recordingPath: undefined,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
