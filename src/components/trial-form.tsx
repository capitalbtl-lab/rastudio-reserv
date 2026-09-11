"use client";

import { useState } from "react";
import { SITE } from "@/data/site";
import { TRIAL_BRANCHES } from "@/data/trial-public";
import { SITE_SIGNUP_DEFAULT, trialUrlFor, type SiteSignup } from "@/data/site-signup-core";
import { TrialEmbed } from "@/components/trial-embed";

const fieldClass =
  "mt-1.5 h-11 w-full rounded-xl bg-bg px-3.5 text-sm shadow-[var(--shadow-border)] outline-none transition-shadow focus:shadow-[var(--shadow-border-hover)] focus:ring-2 focus:ring-primary/30";

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
  const [branch, setBranch] = useState(branchId || "2");
  const src = trialUrlFor(signup, Number(branch) || 2);
  void courseId;

  return (
    <section id={compact ? undefined : "trial"} className="overflow-hidden rounded-[1.75rem] bg-surface px-5 py-8 shadow-[var(--shadow-border)] md:px-10 md:py-11">
      <div className={`grid gap-8 ${compact ? "" : "lg:grid-cols-[0.9fr_1.1fr] lg:items-start"}`}>
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
          <label className="mt-6 block max-w-md">
            <span className="kicker text-muted">Филиал</span>
            <select className={fieldClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
              {TRIAL_BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="h-[min(32rem,70vh)] min-h-[22rem] overflow-hidden rounded-2xl bg-white">
          <TrialEmbed src={src} className="h-full w-full" />
        </div>
      </div>
    </section>
  );
}
