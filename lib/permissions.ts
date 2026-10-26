/**
 * Client-side mirror of the permission table (spec §3).
 * The UI uses these to hide/disable actions; firestore.rules and storage.rules
 * enforce the same logic on the server. Keep the two in sync.
 */
import type { Attachment, Comment, Role, Sprint, Task } from "@/types";

export interface Actor {
  uid: string;
  role: Role;
  active: boolean;
}

type SprintLike = Pick<Sprint, "status"> | null | undefined;
type TaskLike = Pick<Task, "reporterId" | "assigneeIds">;

export const isStaff = (role: Role) => role === "admin" || role === "qa";
export const isClosed = (sprint: SprintLike) => sprint?.status === "closed";

export function canManageUsers(actor: Actor | null): boolean {
  return !!actor?.active && actor.role === "admin";
}

/** Avatar colour: your own, or anyone's for admins (mirrors the users rule). */
export function canSetAvatarColor(actor: Actor | null, userId: string): boolean {
  return !!actor?.active && (actor.uid === userId || actor.role === "admin");
}

export function canManageMasterData(actor: Actor | null): boolean {
  return !!actor?.active && actor.role === "admin";
}

export function canManageSprints(actor: Actor | null): boolean {
  return !!actor?.active && isStaff(actor.role);
}

export function canCarryForward(actor: Actor | null): boolean {
  return canManageSprints(actor);
}

export function canCreateTask(actor: Actor | null, sprint: SprintLike): boolean {
  return !!actor?.active && !!sprint && !isClosed(sprint);
}

/**
 * Every active user can edit any task in an open sprint (team decision; see DECISIONS.md).
 * Developers still can't move tasks between sprints or touch carry-forward fields (rules enforce it).
 * `task` is kept in the signature so ownership-based rules can return without touching callers.
 */
export function canEditTask(actor: Actor | null, task: TaskLike, sprint: SprintLike): boolean {
  void task;
  return !!actor?.active && !!sprint && !isClosed(sprint);
}

export function canDeleteTask(actor: Actor | null, sprint: SprintLike): boolean {
  return !!actor?.active && isStaff(actor.role) && !!sprint && !isClosed(sprint);
}

export function canUploadAttachment(actor: Actor | null, task: TaskLike, sprint: SprintLike): boolean {
  return canEditTask(actor, task, sprint);
}

export function canDeleteAttachment(
  actor: Actor | null,
  task: TaskLike,
  sprint: SprintLike,
  attachment: Pick<Attachment, "uploadedBy">,
): boolean {
  if (!canEditTask(actor, task, sprint) || !actor) return false;
  return isStaff(actor.role) || attachment.uploadedBy === actor.uid;
}

export function canComment(actor: Actor | null, sprint: SprintLike): boolean {
  return !!actor?.active && !!sprint && !isClosed(sprint);
}

export function canEditComment(actor: Actor | null, comment: Pick<Comment, "authorId">, sprint: SprintLike): boolean {
  return canComment(actor, sprint) && comment.authorId === actor?.uid;
}

export function canDeleteComment(actor: Actor | null, comment: Pick<Comment, "authorId">, sprint: SprintLike): boolean {
  if (!canComment(actor, sprint) || !actor) return false;
  return isStaff(actor.role) || comment.authorId === actor.uid;
}
