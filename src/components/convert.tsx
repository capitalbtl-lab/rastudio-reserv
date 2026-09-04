"use client";

import { useEffect, useMemo, useState } from "react";
import type { CmsSession } from "@/data/cms";
import { SITE } from "@/data/site";
import { OBJECTIONS, TRIAL_PROMISE } from "@/data/course-offer";
import { reviewsForPath, YANDEX_RATING } from "@/data/reviews";
import { branchMeta, nextSlots } from "@/lib/schedule";
import { freePlaces, formatTrialDate, nextLessonDate, tidyGroupName, whenShort } from "@/lib/trial-slot";
import { GroupCtas } from "@/components/group-ctas";
import { SITE_SIGNUP_DEFAULT, type SiteSignup } from "@/data/site-signup-core";
import { CoursePrice } from "@/components/course-price";
import { cn } from "@/lib/utils";

export function ConvertBand({
  path,
  sessions,
  onTrial,
  signup = SITE_SIGNUP_DEFAULT,
}: {
  path: string;
  sessions: CmsSession[];
  onTrial?: (id: string) => void;
  signup?: SiteSignup;
}) {
  const slots = nextSlots(sessions, 3);
  const review = reviewsForPath(path)[0];

  return (
    <section className="page-wrap py-5 md:py-6">
      <div className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-end justify-between gap-2 px-5 py-3.5 md:px-6">
          <div>
            <p className="kicker text-primary">Ближайшие группы</p>
            <h2 className="display mt-1 text-xl md:text-2xl">Прийти на этой неделе</h2>
          </div>
          <CoursePrice path={path} tone="row" />
        </div>

        {slots.length ? (
          <ul
            className={cn(
              "grid border-t border-border/70",
              slots.length === 1 ? "md:grid-cols-1" : slots.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3",
            )}
          >
            {slots.map((slot, i) => {
              const meta = branchMeta(slot.session);
              const next = nextLessonDate(slot.session);
              const seats = freePlaces(slot.session);
              return (
                <li key={slot.id} className={cn(i > 0 && "border-t border-border/70 md:border-t-0 md:border-l")}>
                  <div className="flex h-full items-center justify-between gap-3 px-5 py-3.5 md:px-6">
                    <span>
                      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
                        {meta.city}
                      </span>
                      <span className="display mt-0.5 block text-[1.15rem] leading-none">
                        {slot.day} {slot.time}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {tidyGroupName(slot.session.group)}
                        {slot.session.teacher ? ` · ${slot.session.teacher}` : ""}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {seats.label}
                        {next ? ` · пробное ${formatTrialDate(next)}` : ""}
                      </span>
                    </span>
                    {signup.trialOn ? (
                    <a
                      href="#trial"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("ra-pick-group", { detail: slot.session.id }));
                        onTrial?.(slot.session.id);
                      }}
                      className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Запись на пробное
                    </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="border-t border-border/70 px-5 py-3 md:px-6">
            <a
              href="#trial"
              className="inline-flex rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg/65 transition-colors hover:border-fg/25 hover:text-fg"
            >
              Записаться на пробное
            </a>
          </div>
        )}

        <ul className="grid gap-3 border-t border-border/70 px-5 py-3.5 sm:grid-cols-2 lg:grid-cols-4 md:px-6">
          {OBJECTIONS.map((item) => (
            <li key={item.title}>
              <p className="text-[0.86rem] font-semibold leading-snug">{item.title}</p>
              <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">{item.text}</p>
            </li>
          ))}
        </ul>

        {review ? (
          <blockquote className="border-t border-border/70 px-5 py-3.5 md:px-6">
            <p className="max-w-3xl text-[0.9rem] leading-relaxed text-fg/85">
              «{review.text.length > 180 ? `${review.text.slice(0, 180).trim()}…` : review.text}»
            </p>
            <footer className="mt-1.5 text-xs text-muted">
              {review.name} · {review.course} · Яндекс {YANDEX_RATING.score}
            </footer>
          </blockquote>
        ) : null}
      </div>
    </section>
  );
}

export function ConvertAside({
  sessions = [],
  selectedId,
  onPick,
  onTrial,
  signup = SITE_SIGNUP_DEFAULT,
}: {
  sessions?: CmsSession[];
  selectedId?: string;
  onPick?: (id: string) => void;
  onTrial?: (id: string) => void;
  signup?: SiteSignup;
}) {
  const [pick, setPick] = useState(selectedId || sessions[0]?.id || "");
  useEffect(() => {
    if (selectedId) setPick(selectedId);
  }, [selectedId]);
  useEffect(() => {
    function onEvt(e: Event) {
      const id = String((e as CustomEvent).detail || "");
      if (!id) return;
      setPick(id);
      onPick?.(id);
    }
    window.addEventListener("ra-pick-group", onEvt);
    return () => window.removeEventListener("ra-pick-group", onEvt);
  }, [onPick]);

  const group = useMemo(() => sessions.find((s) => s.id === pick) || sessions[0], [sessions, pick]);
  const next = group ? nextLessonDate(group) : null;
  const seats = group ? freePlaces(group) : { n: -1, label: "" };

  return (
    <aside id="trial" className="h-fit rounded-[1.75rem] bg-surface p-5 shadow-[var(--shadow-border)] lg:sticky lg:top-24">
      <p className="kicker text-primary">Запись</p>
      <p className="display mt-2 text-2xl">Группа</p>
      {group ? (
        <div className="mt-3 rounded-2xl bg-bg px-3.5 py-3">
          <p className="font-semibold leading-snug">{tidyGroupName(group.group)}</p>
          <p className="mt-1 text-[0.78rem] text-muted">
            {whenShort(group)}
            {group.teacher ? ` · ${group.teacher}` : ""}
          </p>
          {group.level ? <p className="mt-0.5 text-[0.78rem] text-muted">Уровень: {group.level}</p> : null}
          <p className="mt-0.5 text-[0.78rem] text-muted">
            {seats.label}
            {next ? ` · ближайшее ${formatTrialDate(next)}` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted">{TRIAL_PROMISE}</p>
      )}
      {sessions.length > 1 ? (
        <select
          className="mt-3 h-10 w-full rounded-xl bg-bg px-3 text-sm outline-none ring-1 ring-black/8"
          value={group?.id || ""}
          onChange={(e) => {
            setPick(e.target.value);
            onPick?.(e.target.value);
          }}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {tidyGroupName(s.group) || whenShort(s)} · {whenShort(s)}
            </option>
          ))}
        </select>
      ) : null}
      {group ? (
        <GroupCtas className="mt-4 w-full [&_a]:w-full [&_button]:w-full" session={group} signup={signup} onTrial={() => onTrial?.(group.id)} />
      ) : null}
      <p className="mt-4 text-center text-sm font-semibold">
        <a href={SITE.phoneHref}>{SITE.phone}</a>
      </p>
      <a
        href={SITE.telegram}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block text-center text-sm font-semibold text-primary"
      >
        Написать в Telegram
      </a>
    </aside>
  );
}
