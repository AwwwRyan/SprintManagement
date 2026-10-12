"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/common/user-avatar";
import type { PresenceViewer } from "@/types";

const MAX = 5;

/** Avatars of other users currently viewing the sprint. */
export function PresenceAvatars({ viewers }: { viewers: PresenceViewer[] }) {
  if (viewers.length === 0) return null;
  const shown = viewers.slice(0, MAX);
  const extra = viewers.length - shown.length;
  return (
    <div className="flex items-center gap-2" aria-label={`${viewers.length} other people viewing`}>
      <span className="hidden text-xs text-muted-foreground sm:inline">Viewing</span>
      <div className="flex -space-x-1.5">
        {shown.map((v) => (
          <Tooltip key={v.id}>
            <TooltipTrigger asChild>
              <span className="relative">
                <UserAvatar id={v.id} initials={v.initials} name={v.name} size="md" className="ring-2 ring-background" />
                <span className="absolute right-0 bottom-0 size-2 rounded-full bg-emerald-500 ring-2 ring-background" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{v.name}</TooltipContent>
          </Tooltip>
        ))}
        {extra > 0 && (
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}
