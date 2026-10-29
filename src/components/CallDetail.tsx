"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import { formatDuration, formatDateTime } from "@/lib/format";

type Call = {
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
  keywords: string[];
  actionItems: string[];
  aiError: string | null;
  hasRecording: boolean;
  user: { id: string; name: string; email: string } | null;
  device: { id: string; label: string } | null;
  transcript: { text: string; status: string; provider: string | null } | null;
};

const PROCESSING = new Set(["RECEIVED", "TRANSCRIBING"]);

export function CallDetail({ callId, isAdmin }: { callId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"reprocess" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/calls/${callId}`, { cache: "no-store" });
    if (res.ok) {
      setCall((await res.json()).call);
      setError(null);
    } else {
      setError(res.status === 404 ? "Call not found, or you don't have access to it." : "Could not load this call.");
    }
    setLoading(false);
  }, [callId]);

  useEffect(() => {
    load();
  }, [load]);

  // While the server is still transcribing, check back every few seconds.
  useEffect(() => {
    if (!call || !PROCESSING.has(call.status)) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [call, load]);

  async function reprocess() {
    setBusy("reprocess");
    await fetch(`/api/calls/${callId}/reprocess`, { method: "POST" });
    await load();
    setBusy(null);
  }

  async function remove() {
    if (!confirm("Permanently delete this call, its recording and transcript? This cannot be undone.")) {
      return;
    }
    setBusy("delete");
    const res = await fetch(`/api/calls/${callId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/calls");
      router.refresh();
    } else {
      setError("Could not delete this call.");
      setBusy(null);
    }
  }

  if (loading) return <div className="text-sm text-slate-400">Loading…</div>;
  if (error && !call) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-red-600">{error}</div>
        <Button variant="secondary" onClick={() => router.push("/dashboard/calls")}>
          ← Back to calls
        </Button>
      </div>
    );
  }
  if (!call) return null;

  const counterpart =
    call.direction === "INBOUND" || call.direction === "MISSED" ? call.fromNumber : call.toNumber;
  const processing = PROCESSING.has(call.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => router.push("/dashboard/calls")}
            className="mb-1 text-sm text-slate-500 hover:text-slate-700"
          >
            ← Back to calls
          </button>
          <h1 className="truncate text-xl font-semibold">{call.contactName || counterpart}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Badge value={call.direction} />
            <Badge value={call.status} />
            <Badge value={call.sentiment} />
          </div>
        </div>
        <div className="flex gap-2">
          {call.hasRecording && (
            <Button variant="secondary" onClick={reprocess} disabled={busy !== null || processing}>
              {busy === "reprocess" ? "Processing…" : "Re-run AI"}
            </Button>
          )}
          {isAdmin && (
            <Button variant="danger" onClick={remove} disabled={busy !== null}>
              {busy === "delete" ? "Deleting…" : "Delete"}
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {call.aiError && !processing && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{call.aiError}</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Recording</h2>
            {call.hasRecording ? (
              <audio
                controls
                preload="metadata"
                className="w-full"
                src={`/api/calls/${call.id}/recording`}
              />
            ) : (
              <p className="text-sm text-slate-400">
                {call.direction === "MISSED"
                  ? "Missed call — nothing was recorded."
                  : "No recording was uploaded for this call. Check that automatic call recording is turned on in the phone's dialer."}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Transcript</h2>
              {call.transcript?.provider && (
                <span className="text-xs text-slate-400">{call.transcript.provider}</span>
              )}
            </div>
            <TranscriptBody call={call} processing={processing} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">AI summary</h2>
            {call.summary ? (
              <p className="text-sm leading-relaxed text-slate-700">{call.summary}</p>
            ) : (
              <p className="text-sm text-slate-400">
                {processing ? "Generating…" : "No summary for this call."}
              </p>
            )}
            {call.keywords.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {call.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {k}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {call.actionItems.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Follow-ups</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                {call.actionItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="space-y-2 text-sm">
              <Detail label="From" value={call.fromNumber} />
              <Detail label="To" value={call.toNumber} />
              <Detail label="Started" value={formatDateTime(call.startedAt)} />
              <Detail label="Duration" value={formatDuration(call.durationSec)} />
              <Detail label="Agent" value={call.user?.name ?? "—"} />
              <Detail label="Device" value={call.device?.label ?? "—"} />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TranscriptBody({ call, processing }: { call: Call; processing: boolean }) {
  if (call.transcript?.text) {
    return (
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {call.transcript.text}
      </div>
    );
  }
  let message = "No transcript for this call.";
  if (processing) message = "Transcribing…";
  else if (call.transcript?.status === "SKIPPED") message = "Transcription is not enabled on this server.";
  else if (call.transcript?.status === "FAILED") message = "Transcription failed. Use “Re-run AI” to try again.";
  else if (!call.hasRecording) message = "There is no recording to transcribe.";
  return <p className="text-sm text-slate-400">{message}</p>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}
