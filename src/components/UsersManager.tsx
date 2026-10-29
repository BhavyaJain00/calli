"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  phoneNumber: string | null;
  active: boolean;
  createdAt: string;
  _count: { calls: number };
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "AGENT",
  phoneNumber: "",
};

export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers((await res.json()).users);
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ ...emptyForm });
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not create user");
    }
    setSaving(false);
  }

  async function patch(u: UserRow, body: object): Promise<boolean> {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setListError(data.error || "Update failed");
      return false;
    }
    setListError(null);
    return true;
  }

  async function toggleActive(u: UserRow) {
    if (u.active && !confirm(`Disable ${u.name}? They will be signed out and their phone will stop uploading calls.`)) {
      return;
    }
    if (await patch(u, { active: !u.active })) await load();
  }

  async function resetPassword(u: UserRow) {
    const password = prompt(`New temporary password for ${u.name} (at least 8 characters):`);
    if (!password) return;
    if (password.length < 8) {
      setListError("Password must be at least 8 characters");
      return;
    }
    if (await patch(u, { password })) alert(`Password updated. Share it with ${u.name} securely.`);
  }

  async function remove(u: UserRow) {
    if (!confirm(`Delete ${u.name}'s account? Their past calls are kept but no longer linked to them.`)) {
      return;
    }
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setListError(data.error || "Delete failed");
    }
    await load();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-1">
        <h2 className="mb-4 text-sm font-semibold">Add team member</h2>
        <form onSubmit={createUser} className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Temporary password</Label>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="min 8 characters"
              required
            />
          </div>
          <div>
            <Label>Role</Label>
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="AGENT">Agent (sales)</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </div>
          <div>
            <Label>Business phone (optional)</Label>
            <Input
              value={form.phoneNumber}
              onChange={(e) =>
                setForm({ ...form, phoneNumber: e.target.value })
              }
              placeholder="+1-202-555-0100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Creating…" : "Create user"}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden lg:col-span-2">
        {listError && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{listError}</div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Calls</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge value={u.role} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u._count.calls}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.active ? "text-emerald-600" : "text-slate-400"
                      }
                    >
                      {u.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== currentUserId ? (
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => resetPassword(u)}
                          className="text-sm font-medium text-slate-600 hover:text-slate-900"
                        >
                          Reset password
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          className="text-sm font-medium text-slate-600 hover:text-slate-900"
                        >
                          {u.active ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => remove(u)}
                          className="text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => resetPassword(u)}
                        className="text-sm font-medium text-slate-600 hover:text-slate-900"
                      >
                        Change my password
                      </button>
                    )}
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
