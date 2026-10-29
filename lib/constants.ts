import type { Priority, Role, SprintStatus, TaskStatus, TaskType } from "@/types";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  qa: "QA",
  developer: "Developer",
};

/** An admin with the Product Owner title (display only; same permissions as Admin). */
export const PRODUCT_OWNER_LABEL = "Product Owner";

/** What to call someone's role: "Product Owner" for that one admin, else the role name. */
export function roleLabel(u: { role: Role; productOwner?: boolean }): string {
  return u.role === "admin" && u.productOwner ? PRODUCT_OWNER_LABEL : ROLE_LABELS[u.role];
}

/** Category labels (the `type` field). */
export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  bug: "Bug",
  improvement: "Improvement",
  task: "Task",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Backlog",
  in_progress: "In Progress",
  dev_done: "Fixed",
  testing: "Testing in Progress",
  done: "Ready to Release",
  released: "Released",
  closed: "Cancelled",
  duplicate: "Duplicate",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const SPRINT_STATUS_LABELS: Record<SprintStatus | "backlog", string> = {
  planned: "Planned",
  active: "Active",
  closed: "Closed",
  backlog: "Backlog",
};

/** Tailwind classes for colored badges. Kept in one place so light/dark stay consistent. */
export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  bug: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  improvement: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  task: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  dev_done: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  testing: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  released: "bg-emerald-600 text-white dark:bg-emerald-700",
  closed: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  duplicate: "bg-zinc-200 text-zinc-600 line-through dark:bg-zinc-800 dark:text-zinc-400",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "bg-red-600 text-white dark:bg-red-700",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export const SPRINT_STATUS_COLORS: Record<SprintStatus | "backlog", string> = {
  planned: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  closed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  backlog: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

/**
 * Chart colors (validated with the dataviz palette validator against light + dark surfaces).
 * Task type uses the categorical slots in fixed order; single-series bar charts use one hue.
 * Hex, not CSS variables: SVG presentation attributes don't resolve var().
 */
export const TYPE_CHART_COLORS: Record<"light" | "dark", Record<TaskType, string>> = {
  light: { task: "#2a78d6", bug: "#eb6834", improvement: "#1baf7a" },
  dark: { task: "#3987e5", bug: "#d95926", improvement: "#199e70" },
};
export const BAR_CHART_COLOR: Record<"light" | "dark", string> = { light: "#2a78d6", dark: "#3987e5" };
/** Release-progress stages, in bar order (Ready → Testing → Fixed → In Progress): aqua, violet, yellow, blue. */
export const STAGE_CHART_COLORS: Record<"light" | "dark", Record<"done" | "testing" | "fixed" | "inProgress", string>> = {
  light: { done: "#1baf7a", testing: "#6250d6", fixed: "#eda100", inProgress: "#2a78d6" },
  dark: { done: "#199e70", testing: "#9085e9", fixed: "#c98500", inProgress: "#3987e5" },
};

/** Avatar colour choices (text colour is picked automatically for contrast). */
export const AVATAR_COLORS = [
  "#e11d48", "#db2777", "#c026d3", "#9333ea", "#7c3aed", "#4f46e5", "#2563eb", "#0284c7",
  "#0891b2", "#0d9488", "#059669", "#16a34a", "#65a30d", "#ca8a04", "#ea580c", "#dc2626",
  "#78716c", "#475569", "#171717", "#f472b6", "#38bdf8", "#4ade80", "#facc15", "#fb923c",
] as const;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/* Attachments (stored in Firestore, see lib/attachment-codec.ts) */
/** Max size of a picked file, before compression. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_TASK = 10;
export const ATTACHMENT_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
/** Compression target (MB) and max dimension for stored images. */
export const ATTACHMENT_TARGET_MB = 0.4;
export const ATTACHMENT_MAX_DIMENSION = 1920;
/** base64 characters per chunk doc (stays well under Firestore's 1 MiB doc limit). */
export const ATTACHMENT_CHUNK_CHARS = 900_000;
export const ATTACHMENT_MAX_CHUNKS = 4;
/** Max stored (post-compression) bytes per attachment; mainly limits GIFs, which aren't recompressed. */
export const ATTACHMENT_MAX_STORED_BYTES = 2.5 * 1024 * 1024;
/** Thumbnail kept on the metadata doc so grids don't load full images. */
export const ATTACHMENT_THUMB_PX = 320;

/* Presence */
export const PRESENCE_HEARTBEAT_MS = 30_000;
export const PRESENCE_STALE_MS = 60_000;

/* Writes */
export const BATCH_CHUNK_SIZE = 450;
export const DESCRIPTION_AUTOSAVE_MS = 800;

/** Environment dropdown choices (other existing values are kept and shown as an extra option). */
export const ENVIRONMENTS = ["Staging", "Production"] as const;

export const TASK_KEY_PREFIX = "TSK-";
