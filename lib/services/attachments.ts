"use client";

/**
 * Image attachments stored in Firestore (the project runs on the free Spark plan, which has no
 * Cloud Storage). An attachment is:
 *   tasks/{taskId}/attachments/{id}            metadata + small thumbnail data URL
 *   tasks/{taskId}/attachments/{id}/chunks/{i} base64 slices of the compressed image
 * Everything (chunks, metadata, attachmentCount, activity) is written in ONE batch, so an
 * attachment either fully exists or not at all. Firestore rules guard all of it.
 */
import imageCompression from "browser-image-compression";
import { collection, doc, getDocs, increment, orderBy, query, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { converters } from "@/lib/firebase/refs";
import { addActivity } from "./tasks";
import {
  ATTACHMENT_CONTENT_TYPES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_DIMENSION,
  ATTACHMENT_MAX_PER_TASK,
  ATTACHMENT_TARGET_MB,
  ATTACHMENT_THUMB_PX,
} from "@/lib/constants";
import { fitsStorageBudget, joinBase64, splitBase64, stripDataUrl, toDataUrl } from "@/lib/attachment-codec";
import type { Attachment } from "@/types";

export class AttachmentError extends Error {}

/** Validates a batch of files before upload. Returns the accepted files and per-file errors. */
export function validateAttachmentFiles(
  files: File[],
  existingCount: number,
): { accepted: File[]; errors: string[] } {
  const errors: string[] = [];
  const accepted: File[] = [];
  for (const f of files) {
    if (!(ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(f.type)) {
      errors.push(`${f.name}: only PNG, JPG, WEBP and GIF images are allowed.`);
    } else if (f.size > ATTACHMENT_MAX_BYTES) {
      errors.push(`${f.name}: larger than 10 MB.`);
    } else if (existingCount + accepted.length >= ATTACHMENT_MAX_PER_TASK) {
      errors.push(`${f.name}: a task can have at most ${ATTACHMENT_MAX_PER_TASK} attachments.`);
    } else {
      accepted.push(f);
    }
  }
  return { accepted, errors };
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("Couldn't read the file"));
    r.readAsDataURL(blob);
  });
}

/** Small thumbnail (first frame for GIFs) as a data URL. */
async function makeThumbnail(blob: Blob): Promise<{ thumb: string; width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const { width, height } = bmp;
  const scale = Math.min(1, ATTACHMENT_THUMB_PX / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  let thumb = canvas.toDataURL("image/webp", 0.7);
  if (!thumb.startsWith("data:image/webp")) thumb = canvas.toDataURL("image/jpeg", 0.7); // Safari
  return { thumb, width, height };
}

export interface UploadHandle {
  /** Resolves once everything is written; rejects on failure or cancellation. */
  done: Promise<void>;
  /** Cancels while compressing/encoding. Once the write has started it can't be undone. */
  cancel: () => void;
}

/** Progress: 0–0.9 while compressing/encoding, 1 when saved. */
export function uploadAttachment(
  taskId: string,
  file: File,
  actorId: string,
  onProgress: (fraction: number) => void,
): UploadHandle {
  let cancelled = false;
  const controller = new AbortController();
  const checkCancelled = () => {
    if (cancelled) throw new AttachmentError("Upload cancelled");
  };

  const done = (async () => {
    // GIFs aren't recompressed (that would drop the animation); everything else becomes WebP.
    const isGif = file.type === "image/gif";
    const compressed: Blob = isGif
      ? file
      : await imageCompression(file, {
          maxSizeMB: ATTACHMENT_TARGET_MB,
          maxWidthOrHeight: ATTACHMENT_MAX_DIMENSION,
          fileType: "image/webp",
          useWebWorker: true,
          signal: controller.signal,
          onProgress: (p) => onProgress((p / 100) * 0.7),
        }).catch((err: unknown) => {
          if (cancelled) throw new AttachmentError("Upload cancelled");
          throw err;
        });
    checkCancelled();
    onProgress(0.75);

    const contentType = compressed.type || file.type;
    const base64 = stripDataUrl(await readAsDataUrl(compressed));
    if (!fitsStorageBudget(base64)) {
      throw new AttachmentError(
        `${file.name}: still larger than 2.5 MB after compression${isGif ? " (GIFs can't be compressed)" : ""}.`,
      );
    }
    const { thumb, width, height } = await makeThumbnail(compressed);
    checkCancelled();
    onProgress(0.9);

    const chunks = splitBase64(base64);
    const attachmentRef = doc(collection(db(), "tasks", taskId, "attachments"));
    const fileName = file.name || "pasted-image.png";
    const batch = writeBatch(db());
    batch.set(attachmentRef, {
      fileName,
      contentType,
      chunkCount: chunks.length,
      thumbDataUrl: thumb,
      sizeBytes: compressed.size,
      width,
      height,
      uploadedBy: actorId,
      uploadedAt: serverTimestamp(),
    });
    chunks.forEach((data, index) => {
      batch.set(doc(attachmentRef, "chunks", String(index)), { index, data });
    });
    batch.update(doc(db(), "tasks", taskId), {
      attachmentCount: increment(1),
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    });
    addActivity(batch, taskId, actorId, { action: "attachment_added", newValue: fileName });
    await batch.commit();
    onProgress(1);
  })();

  return {
    done,
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
  };
}

/** Full-size image cache (chunks never change after upload). */
const imageCache = new Map<string, Promise<string>>();

/** Loads and reassembles the full image as a data URL. */
export function loadAttachmentImage(taskId: string, attachment: Attachment): Promise<string> {
  const key = `${taskId}/${attachment.id}`;
  let p = imageCache.get(key);
  if (!p) {
    p = getDocs(
      query(
        collection(db(), "tasks", taskId, "attachments", attachment.id, "chunks").withConverter(converters.chunk),
        orderBy("index"),
      ),
    ).then((snap) => toDataUrl(attachment.contentType, joinBase64(snap.docs.map((d) => d.data()))));
    p.catch(() => imageCache.delete(key));
    imageCache.set(key, p);
  }
  return p;
}

/** Deletes the chunks + metadata, decrements attachmentCount and logs it, in one batch. */
export async function deleteAttachment(taskId: string, attachment: Attachment, actorId: string): Promise<void> {
  const attachmentRef = doc(db(), "tasks", taskId, "attachments", attachment.id);
  const batch = writeBatch(db());
  for (let i = 0; i < attachment.chunkCount; i++) batch.delete(doc(attachmentRef, "chunks", String(i)));
  batch.delete(attachmentRef);
  batch.update(doc(db(), "tasks", taskId), {
    attachmentCount: increment(-1),
    updatedAt: serverTimestamp(),
    updatedBy: actorId,
  });
  addActivity(batch, taskId, actorId, { action: "attachment_removed", oldValue: attachment.fileName });
  await batch.commit();
  imageCache.delete(`${taskId}/${attachment.id}`);
}
