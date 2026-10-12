import { describe, expect, it } from "vitest";
import * as p from "@/lib/permissions";
import type { Actor } from "@/lib/permissions";

const admin: Actor = { uid: "a", role: "admin", active: true };
const qa: Actor = { uid: "q", role: "qa", active: true };
const dev: Actor = { uid: "d", role: "developer", active: true };
const inactive: Actor = { uid: "x", role: "admin", active: false };

const open = { status: "active" as const };
const planned = { status: "planned" as const };
const closed = { status: "closed" as const };

const devTask = { reporterId: "q", assigneeId: "d" };
const otherTask = { reporterId: "q", assigneeId: "z" };
const devReported = { reporterId: "d", assigneeId: null };

describe("permission table (spec §3)", () => {
  it("only admins manage users and master data", () => {
    expect(p.canManageUsers(admin)).toBe(true);
    expect(p.canManageUsers(qa)).toBe(false);
    expect(p.canManageUsers(dev)).toBe(false);
    expect(p.canManageMasterData(admin)).toBe(true);
    expect(p.canManageMasterData(qa)).toBe(false);
  });

  it("QA/Admin manage sprints and carry forward; developers don't", () => {
    expect(p.canManageSprints(admin)).toBe(true);
    expect(p.canManageSprints(qa)).toBe(true);
    expect(p.canManageSprints(dev)).toBe(false);
    expect(p.canCarryForward(dev)).toBe(false);
  });

  it("everyone creates tasks, but not in closed sprints", () => {
    for (const a of [admin, qa, dev]) {
      expect(p.canCreateTask(a, open)).toBe(true);
      expect(p.canCreateTask(a, planned)).toBe(true);
      expect(p.canCreateTask(a, closed)).toBe(false);
    }
  });

  it("every active role can edit any task in an open sprint", () => {
    expect(p.canEditTask(qa, otherTask, open)).toBe(true);
    expect(p.canEditTask(admin, otherTask, open)).toBe(true);
    expect(p.canEditTask(dev, devTask, open)).toBe(true);
    expect(p.canEditTask(dev, devReported, open)).toBe(true);
    expect(p.canEditTask(dev, otherTask, open)).toBe(true);
    expect(p.canEditTask(dev, otherTask, planned)).toBe(true);
  });

  it("nothing is editable in a closed sprint", () => {
    expect(p.canEditTask(admin, devTask, closed)).toBe(false);
    expect(p.canComment(admin, closed)).toBe(false);
    expect(p.canUploadAttachment(admin, devTask, closed)).toBe(false);
    expect(p.canDeleteTask(admin, closed)).toBe(false);
  });

  it("only QA/Admin delete tasks", () => {
    expect(p.canDeleteTask(qa, open)).toBe(true);
    expect(p.canDeleteTask(dev, open)).toBe(false);
  });

  it("attachment deletion: QA/Admin any, developers only their own uploads", () => {
    expect(p.canDeleteAttachment(qa, otherTask, open, { uploadedBy: "someone" })).toBe(true);
    expect(p.canDeleteAttachment(dev, devTask, open, { uploadedBy: "d" })).toBe(true);
    expect(p.canDeleteAttachment(dev, devTask, open, { uploadedBy: "q" })).toBe(false);
    expect(p.canDeleteAttachment(dev, otherTask, open, { uploadedBy: "d" })).toBe(true);
    expect(p.canDeleteAttachment(dev, otherTask, open, { uploadedBy: "q" })).toBe(false);
  });

  it("comments: authors edit own; QA/Admin delete any", () => {
    const mine = { authorId: "d" };
    const theirs = { authorId: "q" };
    expect(p.canEditComment(dev, mine, open)).toBe(true);
    expect(p.canEditComment(dev, theirs, open)).toBe(false);
    expect(p.canEditComment(qa, mine, open)).toBe(false);
    expect(p.canDeleteComment(qa, mine, open)).toBe(true);
    expect(p.canDeleteComment(dev, theirs, open)).toBe(false);
  });

  it("inactive users and missing actors can do nothing", () => {
    expect(p.canManageUsers(inactive)).toBe(false);
    expect(p.canEditTask(inactive, devTask, open)).toBe(false);
    expect(p.canComment(null, open)).toBe(false);
    expect(p.canCreateTask(null, open)).toBe(false);
  });
});
