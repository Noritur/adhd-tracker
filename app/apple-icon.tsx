import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1014",
          color: "#FBBF24",
          fontSize: 128,
          fontWeight: 800,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: -4,
          lineHeight: 1,
        }}
      >
        р
      </div>
    ),
    { ...size },
  );
}
