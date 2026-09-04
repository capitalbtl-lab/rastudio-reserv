"use client";

import type { CmsSession } from "@/data/cms";
import { resolveGroupSignup, type SiteSignup } from "@/data/site-signup-core";
import { cn } from "@/lib/utils";

export function GroupCtas({
  session,
  signup,
  onTrial,
  className,
}: {
  session: CmsSession;
  signup: SiteSignup;
  onTrial: () => void;
  className?: string;
}) {
  const href = resolveGroupSignup({
    signup: session.signup,
    branchId: session.branchId,
    groupId: session.groupId,
  });
  if (!signup.trialOn && !signup.groupOn) return null;
  const btn =
    "inline-flex h-9 min-w-[9.5rem] items-center justify-center rounded-full px-3 text-center text-[0.72rem] font-semibold leading-tight";
  return (
    <span className={cn("flex shrink-0 flex-col gap-1.5", className)}>
      {signup.trialOn ? (
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
      {signup.groupOn && href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={cn(btn, "bg-fg text-bg hover:opacity-90")}
          onClick={(e) => e.stopPropagation()}
        >
          Запись в группу
        </a>
      ) : null}
    </span>
  );
}
