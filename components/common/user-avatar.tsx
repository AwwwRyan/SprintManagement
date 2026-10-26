"use client";

import { useOptionalData } from "@/components/providers/data-provider";
import { cn, readableTextColor } from "@/lib/utils";

const PALETTE = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-fuchsia-500",
];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Initials avatar. Uses the colour the person picked (users.avatarColor, looked up by id),
 * else a stable automatic colour. `color` overrides both (e.g. a live preview).
 */
export function UserAvatar({
  id,
  initials,
  name,
  size = "sm",
  color,
  className,
}: {
  id: string;
  initials: string;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg";
  color?: string | null;
  className?: string;
}) {
  const data = useOptionalData();
  const chosen = color !== undefined ? color : (data?.userById.get(id)?.avatarColor ?? null);
  const sizes = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-14 text-lg" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        chosen ? "" : cn("text-white", colorFor(id)),
        sizes[size],
        className,
      )}
      style={chosen ? { backgroundColor: chosen, color: readableTextColor(chosen) } : undefined}
      title={name}
      aria-label={name}
      data-avatar-color={chosen ?? "auto"}
    >
      {initials}
    </span>
  );
}

export function UserChip({ user }: { user: { id: string; initials: string; name: string; active?: boolean } | undefined }) {
  if (!user) return <span className="text-muted-foreground">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <UserAvatar id={user.id} initials={user.initials} name={user.name} size="xs" />
      <span className={cn("truncate", user.active === false && "text-muted-foreground line-through")}>{user.name}</span>
    </span>
  );
}
