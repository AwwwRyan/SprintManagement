import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon (iOS adds its own rounded corners). */
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
          background: "#171717",
          color: "#fafafa",
          fontSize: 80,
          fontWeight: 700,
          letterSpacing: -3,
        }}
      >
        RT
      </div>
    ),
    size,
  );
}
