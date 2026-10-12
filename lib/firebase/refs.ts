"use client";

/** Typed collection/document references (Firestore `withConverter`). */
import {
  collection,
  doc,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  type WithFieldValue,
} from "firebase/firestore";
import type {
  Activity,
  AppType,
  AppUser,
  Attachment,
  AttachmentChunk,
  Comment,
  Module,
  PresenceViewer,
  Sprint,
  SprintReport,
  Task,
} from "@/types";
import { db } from "./client";

/**
 * Generic converter: exposes the doc id as `id` on read and strips `id` on write.
 * `defaults` backfills fields that may be missing on older documents.
 */
function converter<T extends { id: string }>(defaults: Partial<Omit<T, "id">> = {}): FirestoreDataConverter<T> {
  return {
    toFirestore(model: WithFieldValue<T>): DocumentData {
      const { id: _id, ...rest } = model as WithFieldValue<T> & { id?: unknown };
      void _id;
      return rest;
    },
    fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions): T {
      // "estimate" gives pending serverTimestamp()s a local value instead of null.
      const data = snap.data({ serverTimestamps: "estimate", ...options });
      return { ...defaults, ...data, id: snap.id } as T;
    },
  };
}

const taskDefaults: Partial<Omit<Task, "id">> = {
  description: "",
  descriptionText: "",
  moduleId: null,
  assigneeId: null,
  severity: null,
  estimatedHours: null,
  actualHours: null,
  dueDate: null,
  environment: "",
  remarks: "",
  stepsToReproduce: "",
  expectedResult: "",
  actualResult: "",
  attachmentCount: 0,
  carryOverCount: 0,
  sprintHistory: [],
};

export const converters = {
  user: converter<AppUser>({ designation: "", active: true }),
  appType: converter<AppType>(),
  module: converter<Module>(),
  sprint: converter<Sprint>({ goal: "", closedAt: null, closedBy: null }),
  task: converter<Task>(taskDefaults),
  comment: converter<Comment>({ editedAt: null }),
  attachment: converter<Attachment>({ chunkCount: 0, thumbDataUrl: "" }),
  chunk: converter<AttachmentChunk>(),
  activity: converter<Activity>({ field: null, oldValue: null, newValue: null }),
  report: converter<SprintReport>(),
  presence: converter<PresenceViewer>({ viewingTaskId: null }),
};

export const col = {
  users: () => collection(db(), "users").withConverter(converters.user),
  appTypes: () => collection(db(), "appTypes").withConverter(converters.appType),
  modules: () => collection(db(), "modules").withConverter(converters.module),
  sprints: () => collection(db(), "sprints").withConverter(converters.sprint),
  tasks: () => collection(db(), "tasks").withConverter(converters.task),
  comments: (taskId: string) => collection(db(), "tasks", taskId, "comments").withConverter(converters.comment),
  attachments: (taskId: string) =>
    collection(db(), "tasks", taskId, "attachments").withConverter(converters.attachment),
  activity: (taskId: string) => collection(db(), "tasks", taskId, "activity").withConverter(converters.activity),
  reports: () => collection(db(), "sprintReports").withConverter(converters.report),
  viewers: (sprintId: string) =>
    collection(db(), "presence", sprintId, "viewers").withConverter(converters.presence),
};

export const ref = {
  user: (uid: string) => doc(col.users(), uid),
  appType: (id: string) => doc(col.appTypes(), id),
  module: (id: string) => doc(col.modules(), id),
  sprint: (id: string) => doc(col.sprints(), id),
  task: (id: string) => doc(col.tasks(), id),
  comment: (taskId: string, id: string) => doc(col.comments(taskId), id),
  attachment: (taskId: string, id: string) => doc(col.attachments(taskId), id),
  report: (sprintId: string) => doc(col.reports(), sprintId),
  viewer: (sprintId: string, uid: string) => doc(col.viewers(sprintId), uid),
  /** Raw (unconverted) refs for docs that are written with FieldValues. */
  taskCounter: () => doc(db(), "counters", "tasks"),
  activeSprintMeta: () => doc(db(), "meta", "activeSprint"),
};
