/**
 * Attachments are stored in Firestore (no Firebase Storage on the free Spark plan):
 * the compressed image is base64-encoded and split into chunk docs that each stay well
 * under Firestore's 1 MiB document limit. Pure helpers, no Firebase imports.
 */
import {
  ATTACHMENT_CHUNK_CHARS,
  ATTACHMENT_MAX_CHUNKS,
  ATTACHMENT_MAX_STORED_BYTES,
} from "@/lib/constants";

export function splitBase64(data: string, size: number = ATTACHMENT_CHUNK_CHARS): string[] {
  if (size <= 0) throw new Error("chunk size must be positive");
  if (data.length === 0) return [""];
  const out: string[] = [];
  for (let i = 0; i < data.length; i += size) out.push(data.slice(i, i + size));
  return out;
}

export function joinBase64(chunks: { index: number; data: string }[]): string {
  return [...chunks].sort((a, b) => a.index - b.index).map((c) => c.data).join("");
}

export function toDataUrl(contentType: string, base64: string): string {
  return `data:${contentType};base64,${base64}`;
}

/** Strips the `data:<type>;base64,` prefix from a data URL. */
export function stripDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i === -1 ? dataUrl : dataUrl.slice(i + 1);
}

/** Exact decoded byte length of a base64 string. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Whether a stored (post-compression) image fits the Firestore storage budget. */
export function fitsStorageBudget(base64: string): boolean {
  return (
    base64ByteLength(base64) <= ATTACHMENT_MAX_STORED_BYTES &&
    Math.ceil(base64.length / ATTACHMENT_CHUNK_CHARS) <= ATTACHMENT_MAX_CHUNKS
  );
}
