/**
 * Firestore security rules: each role's allowed and denied actions.
 * Requires the Firestore emulator: `npm run test:rules` (starts it automatically).
 */
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestContext, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  collectionGroup,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { as, baseTask, seed, setupEnv, UIDS } from "./helpers";

let env: RulesTestEnvironment;
const fsOf = (ctx: RulesTestContext) => ctx.firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await setupEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await seed(env);
});

/** Creates a task the same way lib/services/tasks.ts does (counter + task in one batch). */
function createTaskBatch(db: Firestore, uid: string, overrides: Record<string, unknown> = {}, nextKey = 3) {
  const b = writeBatch(db);
  b.update(doc(db, "counters", "tasks"), { next: nextKey + 1 });
  b.set(
    doc(db, "tasks", "t-new"),
    baseTask({
      taskKey: `TSK-${nextKey}`,
      reporterId: uid,
      updatedBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...overrides,
    }),
  );
  return b.commit();
}

describe("authentication & active users", () => {
  it("denies unauthenticated reads", async () => {
    await assertFails(getDoc(doc(fsOf(as(env, null)), "tasks", "t-dev")));
  });
  it("allows active users to read tasks", async () => {
    await assertSucceeds(getDoc(doc(fsOf(as(env, "dev")), "tasks", "t-dev")));
  });
  it("denies deactivated users everything except their own user doc", async () => {
    const db = fsOf(as(env, "inactive"));
    await assertFails(getDoc(doc(db, "tasks", "t-dev")));
    await assertFails(getDocs(collection(db, "sprints")));
    await assertSucceeds(getDoc(doc(db, "users", UIDS.inactive)));
    await assertFails(getDoc(doc(db, "users", UIDS.admin)));
  });
  it("nobody writes users from the client (Admin SDK only)", async () => {
    for (const who of ["admin", "qa", "dev"] as const) {
      await assertFails(updateDoc(doc(fsOf(as(env, who)), "users", UIDS[who]), { role: "admin" }));
    }
  });
});

describe("master data", () => {
  const appType = { name: "New", code: "NW", color: "#112233", active: true };
  it("admin can create and update App Types", async () => {
    const db = fsOf(as(env, "admin"));
    await assertSucceeds(setDoc(doc(db, "appTypes", "app2"), appType));
    await assertSucceeds(updateDoc(doc(db, "appTypes", "app2"), { active: false }));
  });
  it("QA and developers cannot write App Types or Modules", async () => {
    for (const who of ["qa", "dev"] as const) {
      const db = fsOf(as(env, who));
      await assertFails(setDoc(doc(db, "appTypes", "app2"), appType));
      await assertFails(setDoc(doc(db, "modules", "m1"), { name: "M", appTypeId: "app1", active: true }));
    }
  });
  it("validates App Type color and module parent", async () => {
    const db = fsOf(as(env, "admin"));
    await assertFails(setDoc(doc(db, "appTypes", "bad"), { ...appType, color: "blue" }));
    await assertSucceeds(setDoc(doc(db, "appTypes", "long"), { ...appType, code: "SERVICE-PROVIDER" }));
    await assertFails(setDoc(doc(db, "appTypes", "bad2"), { ...appType, code: "HAS SPACE" }));
    await assertFails(setDoc(doc(db, "appTypes", "bad3"), { ...appType, code: "X".repeat(21) }));
    await assertFails(setDoc(doc(db, "modules", "m1"), { name: "M", appTypeId: "missing", active: true }));
    await assertSucceeds(setDoc(doc(db, "modules", "m1"), { name: "M", appTypeId: "app1", active: true }));
  });
  it("App Types cannot be deleted (only deactivated)", async () => {
    await assertFails(deleteDoc(doc(fsOf(as(env, "admin")), "appTypes", "app1")));
  });
});

describe("sprints", () => {
  const newSprint = (uid: string) => ({
    name: "Sprint 99",
    goal: "",
    startDate: "2026-02-01",
    endDate: "2026-02-14",
    status: "planned",
    createdBy: uid,
    createdAt: serverTimestamp(),
    closedAt: null,
    closedBy: null,
  });

  it("QA can create a planned sprint; developers cannot", async () => {
    await assertSucceeds(setDoc(doc(fsOf(as(env, "qa")), "sprints", "s-new"), newSprint(UIDS.qa)));
    await assertFails(setDoc(doc(fsOf(as(env, "dev")), "sprints", "s-new"), newSprint(UIDS.dev)));
  });
  it("rejects a sprint whose end date is before its start", async () => {
    await assertFails(
      setDoc(doc(fsOf(as(env, "qa")), "sprints", "s-new"), { ...newSprint(UIDS.qa), endDate: "2026-01-01" }),
    );
  });
  it("cannot create a sprint directly as active", async () => {
    await assertFails(
      setDoc(doc(fsOf(as(env, "qa")), "sprints", "s-new"), { ...newSprint(UIDS.qa), status: "active" }),
    );
  });
  it("blocks starting a sprint while another is active", async () => {
    const db = fsOf(as(env, "qa"));
    const b = writeBatch(db);
    b.update(doc(db, "sprints", "s-planned"), { status: "active" });
    b.set(doc(db, "meta", "activeSprint"), { sprintId: "s-planned" });
    await assertFails(b.commit());
  });
  it("allows starting a sprint once no sprint is active", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, "sprints", "s-active"), { status: "closed" });
    });
    const db = fsOf(as(env, "qa"));
    const b = writeBatch(db);
    b.update(doc(db, "sprints", "s-planned"), { status: "active" });
    b.set(doc(db, "meta", "activeSprint"), { sprintId: "s-planned" });
    await assertSucceeds(b.commit());
  });
  it("a stale pointer to a deleted sprint doesn't block starting a sprint", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, "meta", "activeSprint"), { sprintId: "s-deleted" });
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, "sprints", "s-active"), { status: "closed" });
    });
    const db = fsOf(as(env, "qa"));
    const b = writeBatch(db);
    b.update(doc(db, "sprints", "s-planned"), { status: "active" });
    b.set(doc(db, "meta", "activeSprint"), { sprintId: "s-planned" });
    await assertSucceeds(b.commit());
  });
  it("closing requires the report snapshot in the same or an earlier write", async () => {
    const db = fsOf(as(env, "qa"));
    const close = () => {
      const b = writeBatch(db);
      b.update(doc(db, "sprints", "s-active"), { status: "closed", closedAt: serverTimestamp(), closedBy: UIDS.qa });
      b.set(doc(db, "meta", "activeSprint"), { sprintId: null });
      return b.commit();
    };
    await assertFails(close());
    await assertSucceeds(
      setDoc(doc(db, "sprintReports", "s-active"), { sprintId: "s-active", createdBy: UIDS.qa, total: 0 }),
    );
    await assertSucceeds(close());
  });
  it("closed sprints are read-only", async () => {
    await assertFails(updateDoc(doc(fsOf(as(env, "admin")), "sprints", "s-closed"), { goal: "changed" }));
  });
  it("developers cannot edit or start sprints", async () => {
    await assertFails(updateDoc(doc(fsOf(as(env, "dev")), "sprints", "s-planned"), { goal: "x" }));
  });
  it("sprints cannot be deleted", async () => {
    await assertFails(deleteDoc(doc(fsOf(as(env, "admin")), "sprints", "s-planned")));
  });
});

describe("sprint reports", () => {
  it("QA/Admin create once; never updated; developers cannot create", async () => {
    await assertFails(
      setDoc(doc(fsOf(as(env, "dev")), "sprintReports", "s-active"), { sprintId: "s-active", createdBy: UIDS.dev }),
    );
    const db = fsOf(as(env, "admin"));
    await assertSucceeds(
      setDoc(doc(db, "sprintReports", "s-active"), { sprintId: "s-active", createdBy: UIDS.admin }),
    );
    await assertFails(updateDoc(doc(db, "sprintReports", "s-active"), { total: 5 }));
    await assertFails(deleteDoc(doc(db, "sprintReports", "s-active")));
  });
  it("cannot create a report for a sprint that is not active", async () => {
    await assertFails(
      setDoc(doc(fsOf(as(env, "qa")), "sprintReports", "s-planned"), { sprintId: "s-planned", createdBy: UIDS.qa }),
    );
  });
});

describe("task creation & counter", () => {
  it("every role can create a task in an open sprint with the reserved key", async () => {
    for (const who of ["admin", "qa", "dev"] as const) {
      await seed(env);
      await assertSucceeds(createTaskBatch(fsOf(as(env, who)), UIDS[who]));
    }
  });
  it("rejects a task whose key does not match the counter", async () => {
    const db = fsOf(as(env, "dev"));
    await assertFails(createTaskBatch(db, UIDS.dev, { taskKey: "TSK-77" }));
  });
  it("rejects creating a task without incrementing the counter", async () => {
    const db = fsOf(as(env, "dev"));
    await assertFails(setDoc(doc(db, "tasks", "t-new"), baseTask({ taskKey: "TSK-3", reporterId: UIDS.dev, updatedBy: UIDS.dev })));
  });
  it("counter may only move by exactly +1", async () => {
    const db = fsOf(as(env, "qa"));
    await assertFails(updateDoc(doc(db, "counters", "tasks"), { next: 10 }));
    await assertFails(updateDoc(doc(db, "counters", "tasks"), { next: 2 }));
  });
  it("reporterId must be the creator", async () => {
    await assertFails(createTaskBatch(fsOf(as(env, "dev")), UIDS.dev, { reporterId: UIDS.qa }));
  });
  it("cannot create a task in a closed sprint", async () => {
    await assertFails(createTaskBatch(fsOf(as(env, "admin")), UIDS.admin, { sprintId: "s-closed" }));
  });
  it("validates the category / status enums and the assignee list", async () => {
    const db = fsOf(as(env, "qa"));
    await assertFails(createTaskBatch(db, UIDS.qa, { status: "nope" }));
    await assertFails(createTaskBatch(db, UIDS.qa, { status: "todo" })); // legacy value
    await assertFails(createTaskBatch(db, UIDS.qa, { type: "enhancement" })); // legacy value
    await assertFails(createTaskBatch(db, UIDS.qa, { assigneeIds: UIDS.dev })); // must be a list
    await assertSucceeds(createTaskBatch(db, UIDS.qa, { type: "improvement", status: "on_hold" }));
  });
  it("accepts several assignees", async () => {
    const db = fsOf(as(env, "qa"));
    await assertSucceeds(createTaskBatch(db, UIDS.qa, { status: "released", assigneeIds: [UIDS.dev, UIDS.dev2] }));
  });
  it("new tasks start with zero attachments / carry-overs", async () => {
    await assertFails(createTaskBatch(fsOf(as(env, "qa")), UIDS.qa, { carryOverCount: 2 }));
  });
});

describe("task updates", () => {
  const edit = (who: "admin" | "qa" | "dev" | "dev2", taskId: string, data: Record<string, unknown>) =>
    updateDoc(doc(fsOf(as(env, who)), "tasks", taskId), { ...data, updatedBy: UIDS[who], updatedAt: serverTimestamp() });

  it("QA and Admin can edit any task", async () => {
    await assertSucceeds(edit("qa", "t-other", { title: "QA edit" }));
    await assertSucceeds(edit("admin", "t-other", { status: "done" }));
  });
  it("developers can edit tasks assigned to them", async () => {
    await assertSucceeds(edit("dev", "t-dev", { status: "in_progress", actualHours: 2.5 }));
  });
  it("developers can edit tasks they reported", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore() as unknown as Firestore, "tasks", "t-reported"),
        baseTask({ taskKey: "TSK-9", reporterId: UIDS.dev, assigneeIds: [] }),
      );
    });
    await assertSucceeds(edit("dev", "t-reported", { title: "mine" }));
  });
  it("developers can edit tasks they neither reported nor are assigned to", async () => {
    await assertSucceeds(edit("dev", "t-other", { title: "team edit", status: "in_progress" }));
  });
  it("developers still can't move tasks between sprints, even other people's", async () => {
    await assertFails(edit("dev", "t-other", { sprintId: "s-planned" }));
  });
  it("developers cannot change protected fields", async () => {
    await assertFails(edit("dev", "t-dev", { sprintId: "s-planned" }));
    await assertFails(edit("dev", "t-dev", { carryOverCount: 5 }));
    await assertFails(edit("dev", "t-dev", { sprintHistory: [{ sprintId: "x" }] }));
  });
  it("nobody can change taskKey or reporterId", async () => {
    await assertFails(edit("admin", "t-dev", { taskKey: "TSK-500" }));
    await assertFails(edit("qa", "t-dev", { reporterId: UIDS.qa + "x" }));
  });
  it("updatedBy must be the requester", async () => {
    await assertFails(updateDoc(doc(fsOf(as(env, "qa")), "tasks", "t-dev"), { title: "x", updatedBy: UIDS.dev }));
  });
  it("no edits at all to tasks in a closed sprint", async () => {
    await assertFails(edit("admin", "t-closed", { title: "late edit" }));
    await assertFails(edit("dev", "t-closed", { status: "done" }));
  });
  it("QA can carry a task out of a closed sprint (carry fields only)", async () => {
    await assertSucceeds(
      edit("qa", "t-closed", {
        sprintId: "s-planned",
        order: 100,
        carryOverCount: increment(1),
        sprintHistory: arrayUnion({ sprintId: "s-closed", sprintName: "x", finalStatusInSprint: "pending", movedAt: Timestamp.now() }),
      }),
    );
  });
  it("carry-forward from a closed sprint cannot smuggle other edits", async () => {
    await assertFails(edit("qa", "t-closed", { sprintId: "s-planned", title: "sneaky" }));
  });
  it("developers cannot carry tasks forward", async () => {
    await assertFails(edit("dev", "t-closed", { sprintId: "s-planned", carryOverCount: 1 }));
  });
  it("anyone can write remarks (text up to 2000 chars); other types are rejected", async () => {
    await assertSucceeds(edit("dev2", "t-dev", { remarks: "Checked on staging\nlooks fine" }));
    await assertFails(edit("dev", "t-dev", { remarks: "x".repeat(2001) }));
    await assertFails(edit("qa", "t-dev", { remarks: 42 }));
  });
  it("releaseDate accepts a YYYY-MM-DD date or null, nothing else", async () => {
    await assertSucceeds(edit("dev", "t-dev", { releaseDate: "2026-11-15" }));
    await assertSucceeds(edit("dev", "t-dev", { releaseDate: null }));
    await assertFails(edit("dev", "t-dev", { releaseDate: "15/11/2026" }));
    await assertFails(edit("qa", "t-dev", { releaseDate: 20261115 }));
  });
  it("attachmentCount can never exceed 10", async () => {
    await assertFails(edit("qa", "t-dev", { attachmentCount: 11 }));
  });
});

describe("task deletion", () => {
  it("QA/Admin can delete; developers cannot", async () => {
    await assertFails(deleteDoc(doc(fsOf(as(env, "dev")), "tasks", "t-dev")));
    await assertSucceeds(deleteDoc(doc(fsOf(as(env, "qa")), "tasks", "t-dev")));
    await assertSucceeds(deleteDoc(doc(fsOf(as(env, "admin")), "tasks", "t-other")));
  });
  it("cannot delete tasks in a closed sprint", async () => {
    await assertFails(deleteDoc(doc(fsOf(as(env, "admin")), "tasks", "t-closed")));
  });
});

describe("comments", () => {
  const comment = (authorId: string) => ({ authorId, body: "Hello\nworld", createdAt: serverTimestamp(), editedAt: null });

  it("any active user can comment on an open task", async () => {
    await assertSucceeds(setDoc(doc(fsOf(as(env, "dev")), "tasks/t-other/comments/c1"), comment(UIDS.dev)));
  });
  it("cannot comment as someone else or on a closed sprint", async () => {
    await assertFails(setDoc(doc(fsOf(as(env, "dev")), "tasks/t-dev/comments/c1"), comment(UIDS.qa)));
    await assertFails(setDoc(doc(fsOf(as(env, "admin")), "tasks/t-closed/comments/c1"), comment(UIDS.admin)));
  });
  it("authors edit their own comments; others cannot", async () => {
    await assertSucceeds(setDoc(doc(fsOf(as(env, "dev")), "tasks/t-dev/comments/c1"), comment(UIDS.dev)));
    await assertSucceeds(
      updateDoc(doc(fsOf(as(env, "dev")), "tasks/t-dev/comments/c1"), { body: "edited", editedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(doc(fsOf(as(env, "qa")), "tasks/t-dev/comments/c1"), { body: "qa edit" }));
  });
  it("authors delete their own; QA/Admin delete any; other developers cannot", async () => {
    await assertSucceeds(setDoc(doc(fsOf(as(env, "dev")), "tasks/t-dev/comments/c1"), comment(UIDS.dev)));
    await assertFails(deleteDoc(doc(fsOf(as(env, "dev2")), "tasks/t-dev/comments/c1")));
    await assertSucceeds(deleteDoc(doc(fsOf(as(env, "qa")), "tasks/t-dev/comments/c1")));
  });
});

describe("attachments (Firestore-stored images)", () => {
  type Who = "admin" | "qa" | "dev" | "dev2";
  const THUMB = "data:image/webp;base64,UklGRg==";
  const meta = (uid: string, overrides: Record<string, unknown> = {}) => ({
    fileName: "shot.png",
    contentType: "image/webp",
    chunkCount: 2,
    thumbDataUrl: THUMB,
    sizeBytes: 1000,
    width: 10,
    height: 10,
    uploadedBy: uid,
    uploadedAt: serverTimestamp(),
    ...overrides,
  });

  /** Mirrors uploadAttachment(): chunks + metadata + count bump in one batch. */
  const upload = (
    who: Who,
    opts: { taskId?: string; meta?: Record<string, unknown>; chunks?: number; countDelta?: number; chunkData?: string } = {},
  ) => {
    const taskId = opts.taskId ?? "t-dev";
    const db = fsOf(as(env, who));
    const b = writeBatch(db);
    const m = meta(UIDS[who], opts.meta);
    b.set(doc(db, `tasks/${taskId}/attachments/a1`), m);
    for (let i = 0; i < (opts.chunks ?? (m.chunkCount as number)); i++) {
      b.set(doc(db, `tasks/${taskId}/attachments/a1/chunks/${i}`), { index: i, data: opts.chunkData ?? "QUJD" });
    }
    b.update(doc(db, "tasks", taskId), {
      attachmentCount: increment(opts.countDelta ?? 1),
      updatedBy: UIDS[who],
      updatedAt: serverTimestamp(),
    });
    return b.commit();
  };

  /** Mirrors deleteAttachment(). */
  const remove = (who: Who, taskId = "t-dev") => {
    const db = fsOf(as(env, who));
    const b = writeBatch(db);
    b.delete(doc(db, `tasks/${taskId}/attachments/a1/chunks/0`));
    b.delete(doc(db, `tasks/${taskId}/attachments/a1/chunks/1`));
    b.delete(doc(db, `tasks/${taskId}/attachments/a1`));
    b.update(doc(db, "tasks", taskId), { attachmentCount: increment(-1), updatedBy: UIDS[who], updatedAt: serverTimestamp() });
    return b.commit();
  };

  it("users who can edit the task can upload; others can read", async () => {
    await assertSucceeds(upload("dev"));
    await assertSucceeds(getDoc(doc(fsOf(as(env, "dev2")), "tasks/t-dev/attachments/a1/chunks/0")));
  });
  it("any developer can attach to any task in an open sprint", async () => {
    await assertSucceeds(upload("dev2"));
  });
  it("deactivated users cannot attach", async () => {
    const db = fsOf(as(env, "inactive"));
    await assertFails(setDoc(doc(db, "tasks/t-dev/attachments/a1"), meta(UIDS.inactive)));
  });
  it("no attachment changes in a closed sprint", async () => {
    await assertFails(upload("admin", { taskId: "t-closed" }));
  });
  it("rejects non-image content types and oversized images", async () => {
    await assertFails(upload("qa", { meta: { contentType: "application/pdf" } }));
    await assertFails(upload("qa", { meta: { sizeBytes: 3 * 1024 * 1024 } }));
    await assertFails(upload("qa", { chunkData: "A".repeat(900_001) }));
  });
  it("requires every chunk and an exact +1 on attachmentCount in the same batch", async () => {
    await assertFails(upload("qa", { chunks: 1 })); // last chunk missing
    await assertFails(upload("qa", { countDelta: 0 }));
    await assertFails(upload("qa", { countDelta: 2 }));
  });
  it("uploadedBy must be the uploader and the thumbnail an image data URL", async () => {
    await assertFails(upload("dev", { meta: { uploadedBy: UIDS.qa } }));
    await assertFails(upload("qa", { meta: { thumbDataUrl: "https://evil.example/x.png" } }));
  });
  it("chunks can't be added or replaced after upload", async () => {
    await assertSucceeds(upload("qa"));
    const db = fsOf(as(env, "qa"));
    await assertFails(setDoc(doc(db, "tasks/t-dev/attachments/a1/chunks/2"), { index: 2, data: "QUJD" }));
    await assertFails(setDoc(doc(db, "tasks/t-dev/attachments/a1/chunks/0"), { index: 0, data: "WFla" }));
    await assertFails(updateDoc(doc(db, "tasks/t-dev/attachments/a1"), { fileName: "renamed.png" }));
  });
  it("cannot exceed 10 attachments per task", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, "tasks", "t-dev"), { attachmentCount: 10 });
    });
    await assertFails(upload("qa"));
  });
  it("developers delete only their own uploads; QA can delete any", async () => {
    await assertSucceeds(upload("qa"));
    await assertFails(remove("dev"));
    await assertSucceeds(remove("qa"));

    await assertSucceeds(upload("dev"));
    await assertSucceeds(remove("dev"));
  });
});

describe("activity log", () => {
  const entry = (actorId: string) => ({
    actorId,
    action: "updated",
    field: "title",
    oldValue: "a",
    newValue: "b",
    createdAt: serverTimestamp(),
  });
  it("is create-only and actorId must be the requester", async () => {
    const db = fsOf(as(env, "dev"));
    await assertSucceeds(setDoc(doc(db, "tasks/t-dev/activity/x1"), entry(UIDS.dev)));
    await assertFails(setDoc(doc(db, "tasks/t-dev/activity/x2"), entry(UIDS.qa)));
    await assertFails(updateDoc(doc(db, "tasks/t-dev/activity/x1"), { newValue: "c" }));
    await assertFails(deleteDoc(doc(fsOf(as(env, "admin")), "tasks/t-dev/activity/x1")));
  });
  it("rejects unknown actions and client-chosen timestamps", async () => {
    const db = fsOf(as(env, "dev"));
    await assertFails(setDoc(doc(db, "tasks/t-dev/activity/x3"), { ...entry(UIDS.dev), action: "hacked" }));
    await assertFails(setDoc(doc(db, "tasks/t-dev/activity/x4"), { ...entry(UIDS.dev), createdAt: Timestamp.now() }));
  });
});

describe("activity across tasks (report export)", () => {
  const q = (db: Firestore) =>
    getDocs(query(collectionGroup(db, "activity"), where("field", "==", "status"), where("createdAt", ">=", Timestamp.fromMillis(0))));
  it("active users can query status changes across all tasks", async () => {
    await assertSucceeds(q(fsOf(as(env, "dev"))));
    await assertSucceeds(q(fsOf(as(env, "admin"))));
  });
  it("deactivated and anonymous users cannot", async () => {
    await assertFails(q(fsOf(as(env, "inactive"))));
    await assertFails(q(fsOf(as(env, null))));
  });
});

describe("presence", () => {
  const viewer = { name: "Dev", initials: "DE", viewingTaskId: null, lastSeen: serverTimestamp() };
  it("users write only their own viewer doc", async () => {
    const db = fsOf(as(env, "dev"));
    await assertSucceeds(setDoc(doc(db, "presence/s-active/viewers", UIDS.dev), viewer));
    await assertFails(setDoc(doc(db, "presence/s-active/viewers", UIDS.qa), viewer));
    await assertSucceeds(deleteDoc(doc(db, "presence/s-active/viewers", UIDS.dev)));
  });
});
