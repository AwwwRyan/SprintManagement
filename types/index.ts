import type { Timestamp } from "firebase/firestore";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const ROLES = ["admin", "qa", "developer"] as const;
export type Role = (typeof ROLES)[number];

export const SPRINT_STATUSES = ["planned", "active", "closed"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

/**
 * The Backlog is stored as one permanent sprint doc (`sprints/backlog`, status "backlog"), so tasks,
 * comments, attachments, rules and links work there unchanged. It never appears in release lists.
 */
export const BACKLOG_ID = "backlog";

/** Shown as "Category" in the UI. */
export const TASK_TYPES = ["bug", "improvement", "task"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** Workflow order. Which statuses are complete / finished / excluded: lib/task-model.ts. */
export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "on_hold",
  "dev_done",
  "testing",
  "done",
  "released",
  "closed",
  "duplicate",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ACTIVITY_ACTIONS = [
  "created",
  "updated",
  "carried_over",
  "moved",
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
  /** chosen avatar colour ("#rrggbb"); null = automatic */
  avatarColor: string | null;
  /** false = never offered as an assignee (still a normal user); default true */
  assignable: boolean;
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
  /** "backlog" only for the Backlog doc (BACKLOG_ID) */
  status: SprintStatus | "backlog";
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
  /** Everyone working on the task (any number; empty = unassigned). */
  assigneeIds: string[];
  priority: Priority;
  estimatedHours: number | null;
  actualHours: number | null;
  status: TaskStatus;
  reporterId: string;
  dueDate: DateString | null;
  /** Planned release date of the change (optional). */
  releaseDate: DateString | null;
  environment: string;
  /** Free-text remarks, editable by everyone (separate from the comment thread). */
  remarks: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  attachmentCount: number;
  carryOverCount: number;
  sprintHistory: SprintHistoryEntry[];
  /** set when the task was created from a suggestion (Suggestions → Add to release) */
  suggestionId: string | null;
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
  | "assigneeIds"
  | "priority"
  | "estimatedHours"
  | "actualHours"
  | "status"
  | "dueDate"
  | "releaseDate"
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

/* ------------------------------------------------------------------ suggestions */

export const SUGGESTION_KINDS = ["idea", "problem", "design", "other"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];
/** "Done" isn't stored: an added suggestion is done when its task is Released. */
export const SUGGESTION_STATUSES = ["new", "added", "not_planned"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export interface Suggestion {
  id: string;
  title: string;
  details: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  authorId: string;
  imageCount: number;
  /** thumbnail of the first screenshot (data URL), "" when none */
  coverThumb: string;
  declineReason: string;
  taskId: string | null;
  taskKey: string | null;
  sprintId: string | null;
  sprintName: string | null;
  /** who added it to a release / marked it not planned */
  handledBy: string | null;
  createdAt: TS;
  updatedAt: TS;
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
  openBugsByPriority: CountByKey[];
  estimatedHours: number;
  actualHours: number;
}

export interface ReportTaskRef {
  taskId: string;
  taskKey: string;
  title: string;
  appTypeId: string;
  assigneeIds: string[];
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
  /** tasks sent to the Backlog at close (reports from before 2026-10-26 don't have it) */
  movedToBacklog?: ReportTaskRef[];
  /** only in older reports: closing now requires every unfinished task to get a destination */
  leftIncomplete: ReportTaskRef[];
  createdBy: string;
  createdAt: TS;
}
