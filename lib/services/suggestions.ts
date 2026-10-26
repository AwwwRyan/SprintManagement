"use client";

/**
 * Suggestion box writes. A suggestion is `suggestions/{id}`; its screenshots are stored like task
 * attachments (`images/{id}` metadata + `chunks/{i}`), each written in one batch with the
 * imageCount increment so the count can't drift. Firestore rules guard all of it.
 */
import { collection, doc, getDocs, increment, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { col, converters } from "@/lib/firebase/refs";
import { chunk } from "@/lib/utils";
import { BATCH_CHUNK_SIZE } from "@/lib/constants";
import { taskDescriptionFor } from "@/lib/suggestions";
import { addImageWrites, prepareImage, writeTaskAttachment, type PreparedImage } from "./attachments";
import { createTask } from "./tasks";
import type { Priority, Sprint, Suggestion, SuggestionKind, TaskType } from "@/types";

export interface NewSuggestion {
  title: string;
  details: string;
  kind: SuggestionKind;
}

/**
 * Saves the suggestion first (so the text is never lost), then each screenshot.
 * Returns the names of screenshots that couldn't be saved.
 */
export async function createSuggestion(
  input: NewSuggestion,
  files: File[],
  actorId: string,
  onStep?: (message: string) => void,
): Promise<{ id: string; failed: string[] }> {
  const ref = doc(collection(db(), "suggestions"));
  await setDoc(ref, {
    title: input.title.trim(),
    details: input.details.trim(),
    kind: input.kind,
    status: "new",
    authorId: actorId,
    imageCount: 0,
    coverThumb: "",
    declineReason: "",
    taskId: null,
    taskKey: null,
    sprintId: null,
    sprintName: null,
    handledBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const failed: string[] = [];
  for (const [i, file] of files.entries()) {
    onStep?.(`Saving picture ${i + 1} of ${files.length}…`);
    try {
      const img = await prepareImage(file);
      const batch = writeBatch(db());
      addImageWrites(batch, doc(collection(ref, "images")), img, actorId);
      batch.update(ref, {
        imageCount: increment(1),
        ...(failed.length === i ? { coverThumb: img.thumb } : {}), // first picture that saved
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch {
      failed.push(file.name || `picture ${i + 1}`);
    }
  }
  return { id: ref.id, failed };
}

/** Screenshot metadata + chunks as a prepared image (to copy onto a task). */
async function readImages(suggestionId: string): Promise<PreparedImage[]> {
  const metas = await getDocs(query(col.suggestionImages(suggestionId), orderBy("uploadedAt")));
  return Promise.all(
    metas.docs.map(async (m) => {
      const a = m.data();
      const chunks = await getDocs(query(collection(m.ref, "chunks").withConverter(converters.chunk), orderBy("index")));
      return {
        fileName: a.fileName,
        contentType: a.contentType,
        chunks: chunks.docs.map((c) => c.data().data),
        thumb: a.thumbDataUrl,
        width: a.width,
        height: a.height,
        sizeBytes: a.sizeBytes,
      };
    }),
  );
}

export interface AddToReleaseInput {
  sprint: Pick<Sprint, "id" | "name">;
  title: string;
  type: TaskType;
  appTypeId: string;
  priority: Priority;
}

/**
 * QA/Admin: turns a suggestion into a task in an open release, links the two, then copies the
 * screenshots onto the task. Returns the new task key and any screenshots that couldn't be copied.
 */
export async function addSuggestionToRelease(
  s: Suggestion,
  input: AddToReleaseInput,
  authorName: string,
  dateLabel: string,
  actorId: string,
): Promise<{ taskKey: string; failedImages: number }> {
  const { description, descriptionText } = taskDescriptionFor(s, authorName, dateLabel);
  const { id: taskId, taskKey } = await createTask(
    {
      title: input.title,
      sprintId: input.sprint.id,
      appTypeId: input.appTypeId,
      type: input.type,
      priority: input.priority,
      status: "pending",
      description,
      descriptionText,
      suggestionId: s.id,
    },
    actorId,
  );
  await updateDoc(doc(db(), "suggestions", s.id), {
    status: "added",
    taskId,
    taskKey,
    sprintId: input.sprint.id,
    sprintName: input.sprint.name,
    handledBy: actorId,
    declineReason: "",
    updatedAt: serverTimestamp(),
  });

  let failedImages = 0;
  if (s.imageCount > 0) {
    const images = await readImages(s.id).catch(() => []);
    failedImages = s.imageCount - images.length;
    for (const img of images) {
      await writeTaskAttachment(taskId, img, actorId).catch(() => {
        failedImages += 1;
      });
    }
  }
  return { taskKey, failedImages };
}

/** QA/Admin: "Not planned", with an optional short reason. */
export async function markSuggestionNotPlanned(id: string, reason: string, actorId: string): Promise<void> {
  await updateDoc(doc(db(), "suggestions", id), {
    status: "not_planned",
    declineReason: reason.trim(),
    handledBy: actorId,
    updatedAt: serverTimestamp(),
  });
}

/** QA/Admin: back to New (e.g. "not planned" by mistake). Not for suggestions already added to a release. */
export async function reopenSuggestion(id: string): Promise<void> {
  await updateDoc(doc(db(), "suggestions", id), { status: "new", declineReason: "", handledBy: null, updatedAt: serverTimestamp() });
}

/** Admin: deletes the screenshots (chunks + metadata), then the suggestion. A linked task is kept. */
export async function deleteSuggestion(id: string): Promise<void> {
  const images = await getDocs(col.suggestionImages(id));
  const refs = images.docs.flatMap((m) => [
    ...Array.from({ length: m.data().chunkCount }, (_, i) => doc(m.ref.withConverter(null), "chunks", String(i))),
    m.ref.withConverter(null),
  ]);
  for (const group of chunk(refs, BATCH_CHUNK_SIZE)) {
    const batch = writeBatch(db());
    group.forEach((r) => batch.delete(r));
    await batch.commit();
  }
  const batch = writeBatch(db());
  batch.delete(doc(db(), "suggestions", id));
  await batch.commit();
}
