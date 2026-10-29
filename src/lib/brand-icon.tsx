import { ImageResponse } from "next/og";

// Renders the square "C" app icon at any size (used for favicon, Apple touch
// icon and the PWA manifest icons). Full-bleed background so it also works as a
// maskable icon.
export function brandIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
          color: "#ffffff",
          fontSize: Math.round(size * 0.55),
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        C
      </div>
    ),
    { width: size, height: size }
  );
}
