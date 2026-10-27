import { z } from "zod";
import { PRIORITIES, ROLES, TASK_STATUSES, TASK_TYPES } from "@/types";
import { requiresEnvironment } from "@/lib/task-model";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/* ---------- Users (admin API bodies) ---------- */

export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    role: z.enum(ROLES),
    designation: z.string().trim().max(100).default(""),
    /** true: email the user a link to set their own password (no password is chosen or shared). */
    invite: z.boolean().default(true),
    password: z.string().max(128).optional(),
  })
  .refine((v) => v.invite || (v.password?.length ?? 0) >= 8, {
    message: "At least 8 characters",
    path: ["password"],
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: z.enum(ROLES).optional(),
    designation: z.string().trim().max(100).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "At least 8 characters").max(128),
});

/* ---------- Auth forms ---------- */

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

/* ---------- Master data ---------- */

export const appTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(20, "At most 20 characters")
    .regex(/^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/, "Letters, digits and single hyphens, e.g. SERVICE-PROVIDER")
    .transform((s) => s.toUpperCase()),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #3b82f6"),
  active: z.boolean(),
});
export type AppTypeInput = z.infer<typeof appTypeSchema>;

export const moduleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  appTypeId: z.string().min(1, "App Type is required"),
  active: z.boolean(),
});
export type ModuleInput = z.infer<typeof moduleSchema>;

/* ---------- Sprints ---------- */

export const sprintSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    goal: z.string().trim().max(500),
    startDate: dateString,
    endDate: dateString,
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });
export type SprintInput = z.infer<typeof sprintSchema>;

/* ---------- Tasks ---------- */

const hours = z
  .number()
  .min(0, "Can't be negative")
  .max(1000)
  .refine((n) => Number.isInteger(n * 2), "Use 0.5 hour steps")
  .nullable();

export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, "Task is required").max(300),
    appTypeId: z.string().min(1, "App Type is required"),
    type: z.enum(TASK_TYPES),
    moduleId: z.string().nullable(),
    assigneeIds: z.array(z.string()).max(20).default([]),
    priority: z.enum(PRIORITIES),
    status: z.enum(TASK_STATUSES),
    estimatedHours: hours,
    actualHours: hours,
    dueDate: dateString.nullable(),
    releaseDate: dateString.nullable().default(null),
    environment: z.string().trim().max(120),
    stepsToReproduce: z.string().max(5000),
    expectedResult: z.string().max(5000),
    actualResult: z.string().max(5000),
    remarks: z.string().max(2000).default(""),
  })
  .superRefine((v, ctx) => {
    if (requiresEnvironment(v.type) && !v.environment) {
      ctx.addIssue({ code: "custom", path: ["environment"], message: "Choose where the bug was found (Staging or Production)" });
    }
  });
export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment can't be empty").max(5000),
});
