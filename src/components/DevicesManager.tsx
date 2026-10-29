"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { formatDateTime, relativeTime } from "@/lib/format";

type DeviceRow = {
  id: string;
  label: string;
  phoneNumber: string | null;
  platform: string;
  appVersion: string | null;
  dialerApp: string | null;
  recordingsVisible: number | null;
  consentAcceptedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
  _count: { calls: number };
};

type AgentOption = { id: string; name: string };

export function DevicesManager({ agents }: { agents: AgentOption[] }) {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [form, setForm] = useState({
    label: "",
    userId: "",
    phoneNumber: "",
    platform: "android",
  });
  const [newToken, setNewToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/devices");
    if (res.ok) setDevices((await res.json()).devices);
  }

  useEffect(() => {
    load();
  }, []);

  async function createDevice(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNewToken(null);
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const data = await res.json();
      setNewToken(data.ingestToken);
      setForm({ label: "", userId: "", phoneNumber: "", platform: "android" });
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not register device");
    }
    setSaving(false);
  }

  async function revoke(d: DeviceRow) {
    if (!confirm(`Revoke "${d.label}"? The phone will stop uploading calls until the agent signs in to the app again.`)) return;
    await fetch(`/api/devices/${d.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-1">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Add a device manually</h2>
          <p className="mb-4 mt-1 text-xs text-slate-500">
            Agents normally connect their phone by signing in to the Calliser Android app, which
            registers it here automatically. Use this form only for VoIP or custom integrations
            that upload calls with a token.
          </p>
          <form onSubmit={createDevice} className="space-y-3">
            <div>
              <Label>Label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Sales line 2 (VoIP)"
                required
              />
            </div>
            <div>
              <Label>Assign to agent</Label>
              <Select
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Phone number</Label>
              <Input
                value={form.phoneNumber}
                onChange={(e) =>
                  setForm({ ...form, phoneNumber: e.target.value })
                }
                placeholder="+1-202-555-0100"
              />
            </div>
            <div>
              <Label>Platform</Label>
              <Select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              >
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="voip">VoIP / PBX</option>
              </Select>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Registering…" : "Register device"}
            </Button>
          </form>
        </Card>

        {newToken && (
          <Card className="border-amber-300 bg-amber-50 p-5">
            <h3 className="text-sm font-semibold text-amber-800">
              Ingest token — shown once
            </h3>
            <p className="mt-1 text-xs text-amber-700">
              Paste this into the companion app. It cannot be retrieved again.
            </p>
            <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs text-slate-800">
              {newToken}
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(newToken)}
              className="mt-2 text-xs font-medium text-amber-800 hover:underline"
            >
              Copy to clipboard
            </button>
          </Card>
        )}
      </div>

      <Card className="overflow-hidden lg:col-span-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Device</th>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Recordings</th>
                <th className="px-4 py-2.5 font-medium">Last seen</th>
                <th className="px-4 py-2.5 font-medium">Calls</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No devices registered yet.
                  </td>
                </tr>
              )}
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{d.label}</div>
                    <div className="text-xs text-slate-400">
                      {d.platform}
                      {d.appVersion ? ` · app ${d.appVersion}` : ""}
                      {d.phoneNumber ? ` · ${d.phoneNumber}` : ""}
                      {!d.consentAcceptedAt && (
                        <span className="text-amber-600"> · consent pending</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {d.user?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <RecordingCheck device={d} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {d.lastSeenAt ? relativeTime(d.lastSeenAt) : "never"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{d._count.calls}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => revoke(d)}
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// Result of the phone's recording check: can Calliser read the call
// recordings made by this phone's dialer?
function RecordingCheck({ device }: { device: DeviceRow }) {
  if (device.platform !== "android") return <span className="text-slate-400">—</span>;
  if (device.recordingsVisible === null) {
    return <span className="text-xs text-slate-400">Update the app to check</span>;
  }
  const googleDialer = /com\.google\.android\.dialer/.test(device.dialerApp ?? "");
  const found = device.recordingsVisible > 0;
  return (
    <div>
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          found ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {found ? `${device.recordingsVisible} found` : "none found"}
      </span>
      {device.dialerApp && (
        <div className="mt-1 max-w-48 truncate text-xs text-slate-400" title={device.dialerApp}>
          {device.dialerApp.replace(/\s*\(.*\)$/, "")}
        </div>
      )}
      {!found && googleDialer && (
        <div className="mt-1 max-w-48 text-xs text-amber-700">
          Google Phone keeps recordings private; only call details sync.
        </div>
      )}
    </div>
  );
}
