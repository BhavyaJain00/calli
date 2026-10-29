import type { MetadataRoute } from "next";

// Web app manifest: lets agents and admins install the dashboard on their
// phone's home screen from the browser ("Add to Home screen" / "Install app").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Calliser — Sales Calls",
    short_name: "Calliser",
    description: "Review recorded sales calls, transcripts and AI summaries.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
