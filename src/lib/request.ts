// Best-effort client IP (behind Vercel/Render/Nginx the first X-Forwarded-For hop).
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Public base URL of this deployment, e.g. https://calls.example.com.
export function publicBaseUrl(headers: Headers): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = headers.get("x-forwarded-host") || headers.get("host") || "localhost:3000";
  const proto =
    headers.get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
