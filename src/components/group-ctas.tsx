"use client";

import type { CmsSession } from "@/data/cms";
import { type SiteSignup } from "@/data/site-signup-core";
import { slotPublicGroup, slotPublicTrial } from "@/data/group-status";
import { cn } from "@/lib/utils";

export function GroupCtas({
  session,
  signup,
  onTrial,
  onGroup,
  className,
}: {
  session: CmsSession;
  signup: SiteSignup;
  onTrial: () => void;
  onGroup?: () => void;
  className?: string;
}) {
  if (!signup.trialOn && !signup.groupOn) return null;
  const hint = {
    statusId: session.statusId,
    priority: session.priority,
    courseId: session.siteCourseId || session.path,
    path: session.path,
    siteCourseId: session.siteCourseId,
  };
  const showTrial = signup.trialOn && slotPublicTrial(hint, signup.statusPublish);
  const showGroup = Boolean(signup.groupOn && slotPublicGroup(hint, signup.statusPublish) && (session.groupId || session.signup) && onGroup);
  if (!showTrial && !showGroup) return null;
  const btn =
    "inline-flex h-9 min-w-[9.5rem] items-center justify-center rounded-full px-3 text-center text-[0.72rem] font-semibold leading-tight";
  return (
    <span className={cn("flex shrink-0 flex-col gap-1.5", className)}>
      {showTrial ? (
        <button
          type="button"
          className={cn(btn, "bg-primary text-white hover:opacity-90")}
          onClick={(e) => {
            e.stopPropagation();
            onTrial();
          }}
        >
          Запись на пробное
        </button>
      ) : null}
      {showGroup ? (
        <button
          type="button"
          className={cn(btn, "bg-fg text-bg hover:opacity-90")}
          onClick={(e) => {
            e.stopPropagation();
            onGroup?.();
          }}
        >
          Запись в группу
        </button>
      ) : null}
    </span>
  );
}