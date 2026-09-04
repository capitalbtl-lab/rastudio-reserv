"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CmsSession } from "@/data/cms";
import { SITE } from "@/data/site";
import { OBJECTIONS, TRIAL_PROMISE } from "@/data/course-offer";
import { reviewsForPath, YANDEX_RATING } from "@/data/reviews";
import { branchMeta, nextSlots } from "@/lib/schedule";
import { freePlaces, formatTrialDate, isoDate, nextLessonDate, tidyGroupName, whenShort } from "@/lib/trial-slot";
import { sendTrial, TRIAL_BRANCHES } from "@/data/trial";
import { Button } from "@/components/ui/button";
import { CoursePrice } from "@/components/course-price";
import { cn } from "@/lib/utils";
import { trialCourseForPath } from "@/data/trial";

export function ConvertBand({ path, sessions }: { path: string; sessions: CmsSession[] }) {
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
                    <a
                      href="#trial"
                      onClick={() => window.dispatchEvent(new CustomEvent("ra-pick-group", { detail: slot.session.id }))}
                      className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg/65 transition-colors hover:border-fg/25 hover:text-fg"
                    >
                      Записаться
                    </a>
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
  path = "",
}: {
  sessions?: CmsSession[];
  selectedId?: string;
  onPick?: (id: string) => void;
  path?: string;
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
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!group) return;
    setError("");
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await sendTrial({
        data: {
          parent: String(form.get("parent") || ""),
          child: String(form.get("child") || ""),
          dob: String(form.get("dob") || ""),
          phone: String(form.get("phone") || ""),
          email: String(form.get("email") || ""),
          course: group.courseId || trialCourseForPath(path),
          branch: String(group.branchId || TRIAL_BRANCHES[0].id),
          gid: String(group.groupId || ""),
          groupName: group.group,
          date: next ? isoDate(next) : "",
          time: group.timeFrom || "",
          kind: "trial",
        },
      });
      if (res.ok) setDone(true);
      else setError(res.error || "Не отправилось.");
    } catch {
      setError("Не удалось отправить. Позвоните нам.");
    } finally {
      setPending(false);
    }
  }

  const field = "mt-1 h-10 w-full rounded-xl bg-bg px-3 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/30";

  return (
    <aside id="trial" className="h-fit rounded-[1.75rem] bg-surface p-5 shadow-[var(--shadow-border)] lg:sticky lg:top-24">
      <p className="kicker text-primary">Пробное</p>
      <p className="display mt-2 text-2xl">Записаться</p>
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
          className={cn(field, "mt-3")}
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

      {done ? (
        <p className="mt-4 text-sm text-fg">Заявку приняли. Напишем в течение 15 минут.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 grid gap-2">
          <input name="parent" required placeholder="ФИО родителя" autoComplete="name" className={field} />
          <input name="child" required placeholder="ФИО ребёнка" className={field} />
          <input name="dob" type="date" required className={field} />
          <input name="phone" type="tel" required placeholder="Телефон" autoComplete="tel" className={field} />
          <input name="email" type="email" placeholder="Почта" autoComplete="email" className={field} />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="mt-1 w-full" size="lg" disabled={pending || !group}>
            {pending ? "Отправляем…" : "Оставить заявку"}
          </Button>
        </form>
      )}
      <p className="mt-3 text-center text-sm font-semibold">
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
