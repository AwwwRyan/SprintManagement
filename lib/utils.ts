import { TASK_KEY_PREFIX } from "@/lib/constants";

export { cn } from "cn";

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatTaskKey(n: number): string {
  return `${TASK_KEY_PREFIX}${n}`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Make a file name safe for Storage paths: keep [a-zA-Z0-9._-], collapse the rest. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (cleaned || "image").slice(0, 100);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    if (code === "permission-denied" || code === "storage/unauthorized") return "You don't have permission to do that.";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
      return "Invalid email or password.";
    if (code === "auth/user-disabled") return "This account has been deactivated.";
    if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
    return err.message;
  }
  return typeof err === "string" ? err : "Something went wrong.";
}

/** Rounds to 0.5 steps (estimated/actual hours). */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * Black or white text for a solid "#rrggbb" background, whichever has the higher WCAG
 * contrast ratio. Falls back to white for unparseable input.
 */
export function readableTextColor(hex: string): "#ffffff" | "#111111" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastDark = (lum + 0.05) / (0.0067 + 0.05); // #111111
  return contrastWhite >= contrastDark ? "#ffffff" : "#111111";
}
