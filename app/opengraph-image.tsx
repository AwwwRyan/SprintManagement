import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STAGES = [
  { label: "Released", share: 34, color: "#059669" },
  { label: "Done", share: 18, color: "#34d399" },
  { label: "Testing", share: 16, color: "#a855f7" },
  { label: "In progress", share: 20, color: "#3b82f6" },
  { label: "Pending", share: 12, color: "#52525b" },
];

/** Link preview (Slack, WhatsApp, Teams, X…): name, one-line pitch, and a release progress bar motif. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#fafafa",
              color: "#0a0a0a",
              borderRadius: 16,
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            RT
          </div>
          <div style={{ fontSize: 30, color: "#a1a1aa" }}>Internal tool</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
          <div style={{ fontSize: 34, color: "#d4d4d8", lineHeight: 1.35, maxWidth: 980 }}>{SITE_DESCRIPTION}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", height: 22, gap: 6 }}>
            {STAGES.map((s) => (
              <div key={s.label} style={{ width: `${s.share}%`, background: s.color, borderRadius: 6 }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 28, fontSize: 24, color: "#a1a1aa" }}>
            {STAGES.map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: s.color }} />
                {s.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
