"use client";

import { SITE } from "@/data/site";
import { SITE_SIGNUP_DEFAULT, trialUrlFor, type SiteSignup } from "@/data/site-signup-core";
import { TrialEmbed } from "@/components/trial-embed";

export function TrialForm({
  compact = false,
  courseId = "",
  branchId = "",
  signup = SITE_SIGNUP_DEFAULT,
}: {
  compact?: boolean;
  courseId?: string;
  branchId?: string;
  signup?: SiteSignup;
}) {
  const src = trialUrlFor(signup, Number(branchId) || 2);
  void courseId;

  return (
    <section id={compact ? undefined : "trial"} className="overflow-hidden rounded-[1.75rem] bg-surface px-5 py-8 shadow-[var(--shadow-border)] md:px-10 md:py-11">
      <div className={`grid gap-8 ${compact ? "" : "lg:grid-cols-[0.85fr_1.15fr] lg:items-start"}`}>
        <div>
          <p className="kicker text-primary">Пробное занятие</p>
          <h2 className="display mt-3 max-w-md text-3xl md:text-4xl">Приведите ребёнка на первое занятие</h2>
          <p className="mt-4 max-w-md text-[0.98rem] leading-relaxed text-muted">
            Без абонемента. После урока решите, продолжать ли. Телефон{" "}
            <a className="font-semibold text-fg" href={SITE.phoneHref}>
              {SITE.phone}
            </a>
            .
          </p>
        </div>
        <div className="h-[40rem] overflow-hidden">
          <TrialEmbed src={src} className="h-full w-full" />
        </div>
      </div>
    </section>
  );
}
