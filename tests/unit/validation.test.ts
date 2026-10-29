import { describe, expect, it } from "vitest";
import {
  appTypeSchema,
  changePasswordSchema,
  createUserSchema,
  sprintSchema,
  taskFormSchema,
  updateUserSchema,
} from "@/lib/validation";

describe("API body schemas", () => {
  it("createUser: normalizes email; invites by default so no password is needed", () => {
    const ok = createUserSchema.parse({ name: " Asha ", email: " ASHA@Example.com ", role: "qa" });
    expect(ok).toMatchObject({ name: "Asha", email: "asha@example.com", designation: "", invite: true });
    expect(createUserSchema.safeParse({ name: "A", email: "a@b.co", role: "owner" }).success).toBe(false);
  });

  it("createUser: without an invite, a password of 8+ characters is required", () => {
    const base = { name: "A", email: "a@b.co", role: "qa" as const, invite: false };
    expect(createUserSchema.safeParse(base).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: "secret123" }).success).toBe(true);
  });

  it("updateUser: rejects empty bodies", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
    expect(updateUserSchema.safeParse({ active: false }).success).toBe(true);
  });
});

describe("form schemas", () => {
  it("app type: uppercases the code and validates the color", () => {
    expect(appTypeSchema.parse({ name: "Portal", code: "pt", color: "#aabbcc", active: true }).code).toBe("PT");
    expect(appTypeSchema.safeParse({ name: "Portal", code: "P T", color: "#aabbcc", active: true }).success).toBe(false);
    expect(appTypeSchema.parse({ name: "SP", code: "service-provider", color: "#aabbcc", active: true }).code).toBe("SERVICE-PROVIDER");
    expect(appTypeSchema.safeParse({ name: "X", code: "-BAD", color: "#aabbcc", active: true }).success).toBe(false);
    expect(appTypeSchema.safeParse({ name: "X", code: "A".repeat(21), color: "#aabbcc", active: true }).success).toBe(false);
    expect(appTypeSchema.safeParse({ name: "Portal", code: "PT", color: "red", active: true }).success).toBe(false);
  });

  it("sprint: end date must not precede start date", () => {
    expect(sprintSchema.safeParse({ name: "S", goal: "", startDate: "2026-01-10", endDate: "2026-01-01" }).success).toBe(false);
    expect(sprintSchema.safeParse({ name: "S", goal: "", startDate: "2026-01-01", endDate: "2026-01-01" }).success).toBe(true);
  });

  const validTask = {
    title: "Fix login",
    appTypeId: "app1",
    type: "task" as const,
    moduleId: null,
    assigneeIds: [],
    priority: "medium" as const,
    status: "pending" as const,
    estimatedHours: 1.5,
    actualHours: null,
    dueDate: null,
    environment: "",
    stepsToReproduce: "",
    expectedResult: "",
    actualResult: "",
  };

  it("task: accepts the new categories / statuses and rejects legacy ones", () => {
    expect(taskFormSchema.safeParse({ ...validTask, type: "improvement", status: "testing" }).success).toBe(true);
    expect(taskFormSchema.safeParse({ ...validTask, status: "on_hold" }).success).toBe(false); // merged into Backlog
    expect(taskFormSchema.safeParse({ ...validTask, type: "enhancement" }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...validTask, status: "blocked" }).success).toBe(false);
    expect(taskFormSchema.parse({ ...validTask, assigneeIds: ["a", "b"] }).assigneeIds).toEqual(["a", "b"]);
  });

  it("task: a bug must say where it was found; other categories may not", () => {
    expect(taskFormSchema.safeParse({ ...validTask, type: "bug", environment: "" }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...validTask, type: "bug", environment: "Production" }).success).toBe(true);
    expect(taskFormSchema.safeParse({ ...validTask, type: "task", environment: "" }).success).toBe(true);
  });

  it("task: hours use 0.5 steps and can't be negative", () => {
    expect(taskFormSchema.safeParse({ ...validTask, estimatedHours: 1.25 }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...validTask, estimatedHours: -1 }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...validTask, estimatedHours: 0.5 }).success).toBe(true);
  });

  it("task: title and app type are required", () => {
    expect(taskFormSchema.safeParse({ ...validTask, title: "  " }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...validTask, appTypeId: "" }).success).toBe(false);
  });

  it("change password: confirmation must match", () => {
    const r = changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "longenough", confirmPassword: "nope" });
    expect(r.success).toBe(false);
  });
});
