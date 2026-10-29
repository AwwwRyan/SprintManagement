"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { KeyRound, LogOut, Monitor, Moon, Palette, Sun } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { useAuth, useCurrentUser } from "@/components/providers/auth-provider";
import { auth } from "@/lib/firebase/client";
import { changePasswordSchema } from "@/lib/validation";
import { roleLabel } from "@/lib/constants";
import { errorMessage } from "@/lib/utils";
import { UserAvatar } from "@/components/common/user-avatar";
import { AvatarColorDialog } from "@/components/common/avatar-color-dialog";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const { profile } = useCurrentUser();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [pwOpen, setPwOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 px-1.5" aria-label="Account menu">
            <UserAvatar id={profile.id} initials={profile.initials} size="sm" color={profile.avatarColor ?? null} />
            <span className="hidden max-w-40 truncate text-sm sm:inline">{profile.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <div className="truncate font-medium">{profile.name}</div>
            <div className="truncate text-xs text-muted-foreground">{profile.email}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {roleLabel(profile)}
              {profile.designation && ` · ${profile.designation}`}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor /> System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setColorOpen(true)}>
            <Palette /> Avatar colour
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPwOpen(true)}>
            <KeyRound /> Change password
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      <AvatarColorDialog user={colorOpen ? profile : null} self onClose={() => setColorOpen(false)} />
    </>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    const user = auth().currentUser;
    if (!user?.email) return;
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      toast.success("Password changed");
      form.reset();
      onOpenChange(false);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        form.setError("currentPassword", { message: "Current password is incorrect" });
      } else {
        toast.error(errorMessage(err));
      }
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) form.reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter your current password, then choose a new one.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="Current password" htmlFor="cur" error={errors.currentPassword?.message}>
            <Input id="cur" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
          </Field>
          <Field label="New password" htmlFor="new" error={errors.newPassword?.message}>
            <Input id="new" type="password" autoComplete="new-password" {...form.register("newPassword")} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm" error={errors.confirmPassword?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
