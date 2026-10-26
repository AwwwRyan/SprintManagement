"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Mail, MoreHorizontal, Palette, Pencil, Plus, UserCheck, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { createUserSchema, resetPasswordSchema, type CreateUserInput } from "@/lib/validation";
import { createUser, resetUserPassword, sendInvite, updateUser } from "@/lib/services/users";
import { notifyError, attempt } from "@/lib/notify";
import { ROLE_LABELS } from "@/lib/constants";
import { ROLES, type AppUser, type Role } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { UserAvatar } from "@/components/common/user-avatar";
import { AvatarColorDialog } from "@/components/common/avatar-color-dialog";
import { PropSelect } from "@/components/tasks/property-controls";

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<z.input<typeof createUserSchema>, unknown, CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", role: "developer", designation: "", invite: true, password: "" },
  });
  const errors = form.formState.errors;
  const invite = form.watch("invite");
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await createUser(values);
      if (!values.invite) {
        toast.success(`${values.name} can now sign in`, { description: "Share the initial password with them securely." });
      } else if (res.emailSent) {
        toast.success(`Invite sent to ${values.email}`, {
          description: `${values.name} will get an email to set their password, then can sign in.`,
        });
      } else {
        toast.warning(`${values.name} was added, but the email didn't send`, {
          description: "Use “Send set-password email” in their row menu to try again.",
        });
      }
      form.reset();
      onOpenChange(false);
    } catch (err) {
      notifyError(err, "Couldn't create user");
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>There&apos;s no self sign-up. Only users you add here can sign in.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="Name" htmlFor="u-name" error={errors.name?.message}>
            <Input id="u-name" autoFocus {...form.register("name")} />
          </Field>
          <Field label="Email" htmlFor="u-email" error={errors.email?.message}>
            <Input id="u-email" type="email" {...form.register("email")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <PropSelect label="Role" value={field.value} options={roleOptions} onChange={(v) => v && field.onChange(v)} />
                )}
              />
            </Field>
            <Field label="Designation" htmlFor="u-des">
              <Input id="u-des" placeholder="e.g. Senior Developer" {...form.register("designation")} />
            </Field>
          </div>
          <Controller
            control={form.control}
            name="invite"
            render={({ field }) => (
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                <span>
                  <span className="font-medium">Email them a link to set their own password</span>
                  <span className="block text-xs text-muted-foreground">
                    Recommended: you never see or share their password.
                  </span>
                </span>
              </label>
            )}
          />
          {!invite && (
            <Field label="Initial password" htmlFor="u-pw" error={errors.password?.message} hint="At least 8 characters.">
              <Input id="u-pw" type="text" autoComplete="off" {...form.register("password")} />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : invite ? "Add & send invite" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  designation: z.string().trim().max(100),
  role: z.enum(ROLES),
});

function EditUserDialog({ user, onClose, isSelf }: { user: AppUser | null; onClose: () => void; isSelf: boolean }) {
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    values: user ? { name: user.name, designation: user.designation, role: user.role } : undefined,
  });
  const onSubmit = form.handleSubmit(async (values) => {
    if (!user) return;
    const ok = await attempt(() => updateUser(user.id, values), "Couldn't update user", "User updated");
    if (ok) onClose();
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {user?.name}</DialogTitle>
          <DialogDescription>Role changes take effect immediately in the user&apos;s open sessions.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="Name" htmlFor="e-name" error={form.formState.errors.name?.message}>
            <Input id="e-name" {...form.register("name")} />
          </Field>
          <Field label="Designation" htmlFor="e-des">
            <Input id="e-des" {...form.register("designation")} />
          </Field>
          <Field label="Role" hint={isSelf ? "You can't change your own role." : undefined}>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <PropSelect
                  label="Role"
                  value={field.value}
                  options={roleOptions}
                  onChange={(v) => v && field.onChange(v as Role)}
                  disabled={isSelf}
                />
              )}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });
  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!user) return;
    const ok = await attempt(
      () => resetUserPassword(user.id, password),
      "Couldn't reset password",
      `Password reset. ${user.name} has been signed out everywhere.`,
    );
    if (ok) {
      form.reset();
      onClose();
    }
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for {user?.name}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="New password" htmlFor="rp" error={form.formState.errors.password?.message}>
            <Input id="rp" type="text" autoComplete="off" autoFocus {...form.register("password")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsersPage() {
  const { actor } = useCurrentUser();
  const { users, loading } = useData();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [resetting, setResetting] = useState<AppUser | null>(null);
  const [toggling, setToggling] = useState<AppUser | null>(null);
  const [coloring, setColoring] = useState<AppUser | null>(null);

  return (
    <>
      <PageHeader
        title="Users"
        description="Users are never deleted, only deactivated, so their names still show on past tasks."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Add user
          </Button>
        }
      />
      {loading ? (
        <Skeleton className="h-64" />
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="p-2.5 text-left font-medium">Name</th>
                <th className="p-2.5 text-left font-medium">Email</th>
                <th className="p-2.5 text-left font-medium">Role</th>
                <th className="p-2.5 text-left font-medium">Designation</th>
                <th className="p-2.5 text-left font-medium">Status</th>
                <th className="w-12 p-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-2.5">
                    <span className="inline-flex items-center gap-2">
                      <UserAvatar id={u.id} initials={u.initials} size="sm" />
                      <span className="font-medium">{u.name}</span>
                      {u.id === actor.uid && <span className="text-xs text-muted-foreground">(you)</span>}
                    </span>
                  </td>
                  <td className="p-2.5 text-muted-foreground">{u.email}</td>
                  <td className="p-2.5">{ROLE_LABELS[u.role]}</td>
                  <td className="p-2.5">{u.designation || <span className="text-muted-foreground">-</span>}</td>
                  <td className="p-2.5">
                    {u.active ? (
                      <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Deactivated</span>
                    )}
                  </td>
                  <td className="p-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(u)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setColoring(u)}>
                          <Palette /> Avatar colour
                        </DropdownMenuItem>
                        {u.active && (
                          <DropdownMenuItem
                            onSelect={() =>
                              void attempt(() => sendInvite(u.id), "Couldn't send email", `Set-password email sent to ${u.email}`)
                            }
                          >
                            <Mail /> Send set-password email
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => setResetting(u)}>
                          <KeyRound /> Set a password
                        </DropdownMenuItem>
                        {u.id !== actor.uid && (
                          <DropdownMenuItem onSelect={() => setToggling(u)}>
                            {u.active ? <UserX /> : <UserCheck />} {u.active ? "Deactivate" : "Reactivate"}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditUserDialog user={editing} onClose={() => setEditing(null)} isSelf={editing?.id === actor.uid} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
      <AvatarColorDialog user={coloring} self={coloring?.id === actor.uid} onClose={() => setColoring(null)} />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.active ? `Deactivate ${toggling?.name}?` : `Reactivate ${toggling?.name}?`}
        description={
          toggling?.active
            ? "They'll be signed out immediately and can't sign in again until reactivated."
            : "They'll be able to sign in again with their existing password."
        }
        confirmLabel={toggling?.active ? "Deactivate" : "Reactivate"}
        destructive={toggling?.active}
        onConfirm={async () => {
          if (toggling) await attempt(() => updateUser(toggling.id, { active: !toggling.active }), "Couldn't update user");
        }}
      />
    </>
  );
}
