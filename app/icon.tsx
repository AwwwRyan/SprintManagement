import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Favicon: the "RT" mark from the sidebar. */
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
          background: "#171717",
          color: "#fafafa",
          borderRadius: 14,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        RT
      </div>
    ),
    size,
  );
}
