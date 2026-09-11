"use client";

import { useState } from "react";
import { SITE } from "@/data/site";
import { TRIAL_BRANCHES } from "@/data/trial-public";
import { SITE_SIGNUP_DEFAULT, trialUrlFor, type SiteSignup } from "@/data/site-signup-core";

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
  const href = trialUrlFor(signup, Number(branch) || 2);
  void courseId;

  return (
    <section id={compact ? undefined : "trial"} className="overflow-hidden rounded-[1.75rem] bg-surface px-5 py-8 shadow-[var(--shadow-border)] md:px-10 md:py-11">
      <div className={`grid gap-8 ${compact ? "" : "lg:grid-cols-[0.9fr_1.1fr] lg:items-start"}`}>
        <div>
          <p className="kicker text-primary">Пробное занятие</p>
          <h2 className="display mt-3 max-w-md text-3xl md:text-4xl">Приведите ребёнка на первое занятие</h2>
          <p className="mt-4 max-w-md text-[0.98rem] leading-relaxed text-muted">
            Заявка уходит в студию сразу. Телефон{" "}
            <a className="font-semibold text-fg" href={SITE.phoneHref}>
              {SITE.phone}
            </a>
            .
          </p>
          <label className="mt-5 block max-w-md">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted">Филиал</span>
            <select
              className={fieldClass}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              {TRIAL_BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <iframe
          title="Запись на пробное"
          src={href}
          className="h-[min(40rem,85vh)] w-full rounded-2xl bg-bg"
          loading="lazy"
        />
      </div>
    </section>
  );
}
