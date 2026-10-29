import { Suspense } from "react";
import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/setup";
import { LoginForm } from "@/components/LoginForm";
import { BrandHeader } from "@/components/BrandHeader";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await needsSetup()) redirect("/setup");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4">
      <div className="w-full max-w-md">
        <BrandHeader subtitle="Sales call recording, transcription & insights" />
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
