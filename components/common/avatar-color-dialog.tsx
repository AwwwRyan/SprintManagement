"use client";

/** Pick the colour of someone's initials circle (your own, or anyone's for admins). */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { setAvatarColor } from "@/lib/services/users";
import { notifyError } from "@/lib/notify";
import { AVATAR_COLORS, HEX_COLOR } from "@/lib/constants";
import { cn, readableTextColor } from "@/lib/utils";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AppUser } from "@/types";

export function AvatarColorDialog({
  user,
  self,
  onClose,
}: {
  user: Pick<AppUser, "id" | "name" | "initials" | "avatarColor"> | null;
  self: boolean;
  onClose: () => void;
}) {
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setColor(user?.avatarColor ?? null), [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setAvatarColor(user.id, color);
      toast.success(self ? "Avatar colour updated" : `${user.name}'s avatar colour updated`);
      onClose();
    } catch (err) {
      notifyError(err, "Couldn't save the colour");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{self ? "Your avatar colour" : `Avatar colour for ${user?.name ?? ""}`}</DialogTitle>
          <DialogDescription>Shown everywhere the initials circle appears. Everyone sees the same colour.</DialogDescription>
        </DialogHeader>

        {user && (
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <UserAvatar id={user.id} initials={user.initials} name={user.name} size="lg" color={color} />
              <div className="text-sm">
                <div className="font-medium">{user.name}</div>
                <div className="text-xs text-muted-foreground">{color ? color.toUpperCase() : "Automatic colour"}</div>
              </div>
            </div>

            <div className="grid grid-cols-8 gap-2" role="radiogroup" aria-label="Avatar colours">
              {AVATAR_COLORS.map((c) => {
                const on = color?.toLowerCase() === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`Colour ${c}`}
                    onClick={() => setColor(c)}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on && "ring-2 ring-foreground",
                    )}
                    style={{ backgroundColor: c, color: readableTextColor(c) }}
                  >
                    {on && <Check className="size-4" />}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="color"
                  value={color && HEX_COLOR.test(color) ? color : "#2563eb"}
                  onChange={(e) => setColor(e.target.value)}
                  className="size-8 cursor-pointer rounded border bg-transparent"
                  aria-label="Custom colour"
                />
                Custom…
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setColor(null)} disabled={color === null}>
                Use automatic colour
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || (user?.avatarColor ?? null) === color}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
