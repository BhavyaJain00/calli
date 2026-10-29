"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";

export function SetupForm({ tokenRequired }: { tokenRequired: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    setupToken: "",
    orgName: "",
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    setSaving(true);
    const { confirm: _confirm, ...payload } = form;
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    const issues = data.issues ? Object.values(data.issues).flat()[0] : null;
    setError((issues as string) || data.error || "Setup failed");
    setSaving(false);
  }

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        {tokenRequired && (
          <div>
            <Label htmlFor="setupToken">Setup token</Label>
            <Input
              id="setupToken"
              value={form.setupToken}
              onChange={set("setupToken")}
              autoComplete="off"
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              The SETUP_TOKEN value from the server&apos;s environment settings.
            </p>
          </div>
        )}
        <div>
          <Label htmlFor="orgName">Company name</Label>
          <Input id="orgName" value={form.orgName} onChange={set("orgName")} required />
        </div>
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={form.name} onChange={set("name")} autoComplete="name" required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={set("email")}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            value={form.confirm}
            onChange={set("confirm")}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Creating workspace…" : "Create workspace"}
        </Button>
      </form>
    </Card>
  );
}
