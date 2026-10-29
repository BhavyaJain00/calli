"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// "Install web app" for the dashboard. Chrome/Edge/Android fire
// `beforeinstallprompt`; iOS Safari needs Share → Add to Home Screen.
export function InstallAppButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return <p className="text-sm text-emerald-700">The dashboard is installed on this device.</p>;
  }
  if (prompt) {
    return (
      <Button
        onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice.outcome === "accepted") setInstalled(true);
          setPrompt(null);
        }}
      >
        Install dashboard app
      </Button>
    );
  }
  return (
    <p className="text-sm text-slate-500">
      {isIos
        ? "On iPhone: tap the Share button in Safari, then “Add to Home Screen”."
        : "Open this page on your phone in Chrome, then use the menu → “Install app” or “Add to Home screen”."}
    </p>
  );
}
