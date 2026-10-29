import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { publicBaseUrl } from "@/lib/request";
import { Card } from "@/components/ui";
import { CopyText } from "@/components/CopyText";
import { InstallAppButton } from "@/components/InstallAppButton";
import appInfo from "@/generated/mobile-app.json";

export const dynamic = "force-dynamic";

type AppInfo = {
  available: boolean;
  versionName?: string;
  sizeBytes?: number;
  sha256?: string;
  builtAt?: string;
};

export default async function MobileAppPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const app = appInfo as AppInfo;
  const baseUrl = publicBaseUrl(await headers());
  const isHttps = baseUrl.startsWith("https://");
  const deepLink = `calliser://setup?server=${encodeURIComponent(baseUrl)}&email=${encodeURIComponent(user.email)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Mobile app</h1>
        <p className="text-sm text-slate-500">
          Put Calliser on your work phone so your calls and recordings appear here automatically.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold">1. Android app — syncs calls and recordings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Reads the phone&apos;s call history and uploads each call, with its recording, to this
          dashboard. Calls sync right after they end and every 15 minutes in the background.
        </p>

        <div className="mt-4">
          {app.available ? (
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/downloads/calliser.apk"
                download
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Download Calliser for Android
              </a>
              <span className="text-xs text-slate-500">
                Version {app.versionName}
                {app.sizeBytes ? ` · ${(app.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
              </span>
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The Android app hasn&apos;t been published on this server yet. An administrator needs
              to build it (see the project README, “Android app”).
            </p>
          )}
        </div>

        <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm text-slate-700">
          <li>
            Open this page on the Android phone, tap <strong>Download</strong>, then open the file.
            If asked, allow your browser to <em>install unknown apps</em>.
          </li>
          <li>
            Open Calliser and sign in with your Calliser email and password, using this server
            address:
            <div className="mt-2">
              <CopyText value={baseUrl} />
            </div>
            <a
              href={deepLink}
              className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Already installed? Open the app with this address filled in →
            </a>
          </li>
          <li>
            Confirm the recording-consent notice and allow the <strong>Call logs</strong>,{" "}
            <strong>Phone</strong> and <strong>Music and audio</strong> permissions.
          </li>
          <li>
            In the phone&apos;s own <strong>Phone</strong> app, turn on automatic call recording
            (usually Settings → Call recording → Record calls automatically). Calliser uploads the
            recordings your phone makes.
          </li>
          <li>
            In Android settings, set Calliser&apos;s battery usage to <strong>Unrestricted</strong>{" "}
            so background sync isn&apos;t paused.
          </li>
        </ol>

        {!isHttps && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This server is not using HTTPS. The Android app only connects to <code>https://</code>{" "}
            addresses, so deploy the dashboard with HTTPS before connecting phones.
          </p>
        )}
        {app.sha256 && (
          <p className="mt-4 break-all text-xs text-slate-400">SHA-256: {app.sha256}</p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold">2. Install the dashboard on your phone</h2>
        <p className="mt-1 mb-3 text-sm text-slate-500">
          Adds this dashboard to your home screen so you can review calls, play recordings and
          read transcripts like an app. Works on Android and iPhone.
        </p>
        <InstallAppButton />
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Good to know</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>
            Android doesn&apos;t let third-party apps capture call audio directly. Calliser uploads
            the recordings made by the phone&apos;s built-in call recorder (Samsung, Xiaomi, OnePlus,
            Oppo, Realme, Vivo, Motorola and others). On phones without one, or that store
            recordings privately, only call details are synced.
          </li>
          <li>
            iPhones don&apos;t allow any app to read call history or recordings, so call sync is
            Android-only. iPhone users can still use the dashboard.
          </li>
          <li>
            Only calls made after you sign in to the app are uploaded. Recording laws differ by
            country and state; make sure the people you call are informed.
          </li>
        </ul>
      </Card>
    </div>
  );
}
