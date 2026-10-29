"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Card, Input, Select } from "@/components/ui";
import { formatDuration, formatDateTime } from "@/lib/format";

type CallRow = {
  id: string;
  direction: string;
  fromNumber: string;
  toNumber: string;
  contactName: string | null;
  startedAt: string;
  durationSec: number;
  status: string;
  sentiment: string | null;
  summary: string | null;
  hasRecording: boolean;
  user: { id: string; name: string } | null;
};

type AgentOption = { id: string; name: string };

const REFRESH_MS = 30_000;

function counterpart(c: CallRow) {
  return c.direction === "INBOUND" || c.direction === "MISSED" ? c.fromNumber : c.toNumber;
}

export function CallsTable({ isAdmin, agents }: { isAdmin: boolean; agents: AgentOption[] }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ q: "", direction: "", sentiment: "", userId: "" });
  const requestId = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      const id = ++requestId.current;
      if (!silent) setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      try {
        const res = await fetch(`/api/calls?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Could not load calls");
        const data = await res.json();
        if (id !== requestId.current) return; // a newer request superseded this one
        setCalls(data.calls);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setError(null);
      } catch (err) {
        if (id === requestId.current && !silent) {
          setError(err instanceof Error ? err.message : "Could not load calls");
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [page, filters]
  );

  // Debounce filter/page changes.
  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  // New calls arrive from phones in the background; refresh quietly.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const setFilter = (key: keyof typeof filters) => (value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search number, contact, summary…"
          value={filters.q}
          onChange={(e) => setFilter("q")(e.target.value)}
        />
        <Select value={filters.direction} onChange={(e) => setFilter("direction")(e.target.value)}>
          <option value="">All directions</option>
          <option value="INBOUND">Inbound</option>
          <option value="OUTBOUND">Outbound</option>
          <option value="MISSED">Missed</option>
        </Select>
        <Select value={filters.sentiment} onChange={(e) => setFilter("sentiment")(e.target.value)}>
          <option value="">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </Select>
        {isAdmin && (
          <Select value={filters.userId} onChange={(e) => setFilter("userId")(e.target.value)}>
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Phones: card list */}
      <div className="space-y-2 md:hidden">
        {loading && <Card className="p-6 text-center text-sm text-slate-400">Loading…</Card>}
        {!loading && calls.length === 0 && (
          <Card className="p-6 text-center text-sm text-slate-400">No calls found.</Card>
        )}
        {!loading &&
          calls.map((c) => (
            <Link key={c.id} href={`/dashboard/calls/${c.id}`} className="block">
              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.contactName || counterpart(c)}</div>
                    <div className="truncate text-xs text-slate-400">
                      {counterpart(c)}
                      {isAdmin && c.user ? ` · ${c.user.name}` : ""}
                    </div>
                  </div>
                  <Badge value={c.direction} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatDateTime(c.startedAt)}</span>
                  <span>· {formatDuration(c.durationSec)}</span>
                  {c.hasRecording && <span className="text-brand-600">· recording</span>}
                  <Badge value={c.sentiment} />
                </div>
                {c.summary && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{c.summary}</p>
                )}
              </Card>
            </Link>
          ))}
      </div>

      {/* Desktop: table */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Direction</th>
                <th className="px-4 py-2.5 font-medium">Contact / Number</th>
                {isAdmin && <th className="px-4 py-2.5 font-medium">Agent</th>}
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Duration</th>
                <th className="px-4 py-2.5 font-medium">Sentiment</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && calls.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No calls found.
                  </td>
                </tr>
              )}
              {!loading &&
                calls.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Badge value={c.direction} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.contactName || counterpart(c)}</div>
                      <div className="text-xs text-slate-400">
                        {counterpart(c)}
                        {c.hasRecording && <span className="ml-2 text-brand-600">● rec</span>}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-slate-600">{c.user?.name ?? "—"}</td>
                    )}
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(c.startedAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDuration(c.durationSec)}</td>
                    <td className="px-4 py-3">
                      <Badge value={c.sentiment} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge value={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/calls/${c.id}`}
                        className="font-medium text-brand-600 hover:text-brand-700"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{total} calls</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
