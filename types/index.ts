import type { Timestamp } from "firebase/firestore";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const ROLES = ["admin", "qa", "developer"] as const;
export type Role = (typeof ROLES)[number];

export const SPRINT_STATUSES = ["planned", "active", "closed"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const TASK_TYPES = ["requirement", "bug", "enhancement", "task"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "ready_for_qa",
  "qa_testing",
  "done",
  "reopened",
  "blocked",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SEVERITIES = ["blocker", "major", "minor", "trivial"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ACTIVITY_ACTIONS = [
  "created",
  "updated",
  "carried_over",
  "attachment_added",
  "attachment_removed",
  "comment_added",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** Firestore Timestamp, or null while a serverTimestamp() write is pending. */
export type TS = Timestamp | null;

/** Date-only values (sprint dates, due dates) are stored as "YYYY-MM-DD" strings. */
export type DateString = string;

/* ------------------------------------------------------------------ */
/* Documents (every doc type carries its Firestore id as `id`)          */
/* ------------------------------------------------------------------ */

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  designation: string;
  active: boolean;
  initials: string;
  createdAt: TS;
  updatedAt: TS;
}

export interface AppType {
  id: string;
  name: string;
  code: string;
  color: string;
  active: boolean;
  createdAt: TS;
}

export interface Module {
  id: string;
  name: string;
  appTypeId: string;
  active: boolean;
  createdAt: TS;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  startDate: DateString;
  endDate: DateString;
  status: SprintStatus;
  createdBy: string;
  createdAt: TS;
  closedAt: TS;
  closedBy: string | null;
}

export interface SprintHistoryEntry {
  sprintId: string;
  sprintName: string;
  finalStatusInSprint: TaskStatus;
  movedAt: Timestamp;
}

export interface Task {
  id: string;
  taskKey: string;
  sprintId: string;
  order: number;
  appTypeId: string;
  type: TaskType;
  moduleId: string | null;
  title: string;
  /** Tiptap JSON document, serialized as a string (see DECISIONS.md). */
  description: string;
  descriptionText: string;
  assigneeId: string | null;
  priority: Priority;
  severity: Severity | null;
  estimatedHours: number | null;
  actualHours: number | null;
  status: TaskStatus;
  reporterId: string;
  dueDate: DateString | null;
  environment: string;
  /** Free-text remarks, editable by everyone (separate from the comment thread). */
  remarks: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  attachmentCount: number;
  carryOverCount: number;
  sprintHistory: SprintHistoryEntry[];
  createdAt: TS;
  updatedAt: TS;
  updatedBy: string;
}

/** Fields a user may change through the table / side panel. */
export type EditableTaskField =
  | "appTypeId"
  | "type"
  | "moduleId"
  | "title"
  | "description"
  | "assigneeId"
  | "priority"
  | "severity"
  | "estimatedHours"
  | "actualHours"
  | "status"
  | "dueDate"
  | "environment"
  | "remarks"
  | "stepsToReproduce"
  | "expectedResult"
  | "actualResult";

export type TaskPatch = Partial<Pick<Task, EditableTaskField | "descriptionText">>;

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  createdAt: TS;
  editedAt: TS;
}

/** Metadata doc. The image itself lives in `attachments/{id}/chunks/{index}` (base64). */
export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  /** Number of chunk docs holding the base64 image. */
  chunkCount: number;
  /** Small WebP/JPEG data URL used for the thumbnail grid. */
  thumbDataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  uploadedBy: string;
  uploadedAt: TS;
}

export interface AttachmentChunk {
  id: string;
  index: number;
  data: string;
}

export type ActivityValue = string | number | boolean | null;

export interface Activity {
  id: string;
  actorId: string;
  action: ActivityAction;
  field: string | null;
  oldValue: ActivityValue;
  newValue: ActivityValue;
  createdAt: TS;
}

export interface PresenceViewer {
  id: string;
  name: string;
  initials: string;
  viewingTaskId: string | null;
  lastSeen: TS;
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export interface CountByKey {
  key: string;
  count: number;
}

export interface PersonBreakdown {
  userId: string | null;
  name: string;
  tasks: number;
  done: number;
  estimatedHours: number;
  actualHours: number;
}

export interface AppTypeBreakdown {
  appTypeId: string;
  name: string;
  color: string;
  total: number;
  done: number;
  completionPct: number;
}

export interface SprintMetrics {
  total: number;
  done: number;
  completionPct: number;
  byStatus: CountByKey[];
  byType: CountByKey[];
  byAppType: AppTypeBreakdown[];
  byPerson: PersonBreakdown[];
  openBugsBySeverity: CountByKey[];
  estimatedHours: number;
  actualHours: number;
}

export interface ReportTaskRef {
  taskId: string;
  taskKey: string;
  title: string;
  appTypeId: string;
  assigneeId: string | null;
  status: TaskStatus;
  targetSprintId?: string;
  targetSprintName?: string;
}

export interface SprintReport extends SprintMetrics {
  id: string;
  sprintId: string;
  sprintName: string;
  goal: string;
  startDate: DateString;
  endDate: DateString;
  bugsOpened: number;
  bugsFixed: number;
  carriedOver: ReportTaskRef[];
  leftIncomplete: ReportTaskRef[];
  createdBy: string;
  createdAt: TS;
}
