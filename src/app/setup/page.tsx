import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/setup";
import { getSetupToken } from "@/lib/env";
import { SetupForm } from "@/components/SetupForm";
import { BrandHeader } from "@/components/BrandHeader";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");
  const tokenRequired =
    Boolean(getSetupToken()) || process.env.NODE_ENV === "production";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4 py-10">
      <div className="w-full max-w-md">
        <BrandHeader subtitle="Create your company workspace and admin account" />
        <SetupForm tokenRequired={tokenRequired} />
      </div>
    </div>
  );
}
