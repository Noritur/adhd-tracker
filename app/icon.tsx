import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 360,
          fontWeight: 800,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: -10,
          lineHeight: 1,
        }}
      >
        р
      </div>
    ),
    { ...size },
  );
}
