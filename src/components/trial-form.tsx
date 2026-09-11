"use client";

import { SITE } from "@/data/site";
import { SITE_SIGNUP_DEFAULT, openTrialForm, type SiteSignup } from "@/data/site-signup-core";

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
  void courseId;
  void signup;

  return (
    <section
      id={compact ? undefined : "trial"}
      className="rounded-[1.75rem] bg-surface px-5 py-8 shadow-[var(--shadow-border)] md:px-10 md:py-10"
    >
      <p className="kicker text-primary">Пробное занятие</p>
      <h2 className="display mt-3 max-w-lg text-3xl md:text-4xl">Приведите ребёнка на первое занятие</h2>
      <p className="mt-4 max-w-lg text-[0.98rem] leading-relaxed text-muted">
        Без абонемента. После урока решите, продолжать ли. Телефон{" "}
        <a className="font-semibold text-fg" href={SITE.phoneHref}>
          {SITE.phone}
        </a>
        .
      </p>
      <button
        type="button"
        onClick={() => openTrialForm(Number(branchId) || 2)}
        className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-6 text-[0.95rem] font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        Записаться на пробное
      </button>
    </section>
  );
}
