"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { CmsSession } from "@/data/cms";
import { AGE_BANDS, type AgeBandId } from "@/data/ages";
import { PageLink } from "@/components/page-link";
import { cn } from "@/lib/utils";
import {
  WEEKDAYS,
  branchMeta,
  courseHref,
  courseKey,
  courseTitle,
  expandSlots,
  matchesAgeBand,
} from "@/lib/schedule";

function Chip({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors",
        on ? "bg-fg text-bg" : "bg-surface text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
      )}
    >
      {children}
    </button>
  );
}

export function ScheduleFinder({ sessions }: { sessions: CmsSession[] }) {
  const [city, setCity] = useState("");
  const [age, setAge] = useState<AgeBandId | "">("");
  const [day, setDay] = useState("");
  const [course, setCourse] = useState("");

  const cities = useMemo(
    () => [...new Set(sessions.map((s) => branchMeta(s).city))].sort((a, b) => a.localeCompare(b, "ru")),
    [sessions],
  );

  const courses = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) map.set(courseKey(s), courseTitle(s));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [sessions]);

  const slots = useMemo(() => {
    const out = [];
    for (const session of sessions) {
      const meta = branchMeta(session);
      if (city && meta.city !== city) continue;
      if (age && !matchesAgeBand(session.age, age)) continue;
      if (course && courseKey(session) !== course) continue;
      for (const slot of expandSlots(session)) {
        if (day && slot.day !== day) continue;
        out.push(slot);
      }
    }
    return out.sort(
      (a, b) => a.sort - b.sort || courseTitle(a.session).localeCompare(courseTitle(b.session), "ru"),
    );
  }, [sessions, city, age, day, course]);

  const groups = useMemo(() => {
    const list: { day: string; label: string; items: typeof slots }[] = [];
    for (const slot of slots) {
      const last = list[list.length - 1];
      if (last && last.day === slot.day) last.items.push(slot);
      else list.push({ day: slot.day, label: slot.dayLabel, items: [slot] });
    }
    return list;
  }, [slots]);

  const active = Boolean(city || age || day || course);

  return (
    <section className="mt-8">
      <div className="rounded-[1.5rem] bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Город</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip on={!city} onClick={() => setCity("")}>
              Все
            </Chip>
            {cities.map((item) => (
              <Chip key={item} on={city === item} onClick={() => setCity(item)}>
                {item}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Возраст</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip on={!age} onClick={() => setAge("")}>
              Все
            </Chip>
            {AGE_BANDS.map((band) => (
              <Chip key={band.id} on={age === band.id} onClick={() => setAge(band.id)}>
                {band.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">День недели</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip on={!day} onClick={() => setDay("")}>
              Все
            </Chip>
            {WEEKDAYS.map((item) => (
              <Chip key={item.id} on={day === item.id} onClick={() => setDay(item.id)}>
                {item.id}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Курс</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip on={!course} onClick={() => setCourse("")}>
              Все
            </Chip>
            {courses.map(([id, name]) => (
              <Chip key={id} on={course === id} onClick={() => setCourse(id)}>
                {name}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
          <p className="text-sm text-muted">
            {slots.length
              ? `${slots.length} ${slots.length === 1 ? "занятие" : slots.length < 5 ? "занятия" : "занятий"}`
              : "Нет занятий"}
          </p>
          {active ? (
            <button
              type="button"
              className="text-sm font-semibold text-primary"
              onClick={() => {
                setCity("");
                setAge("");
                setDay("");
                setCourse("");
              }}
            >
              Сбросить
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {groups.length ? (
          groups.map((group) => (
            <section
              key={group.day || "none"}
              className="overflow-hidden rounded-[1.35rem] bg-surface shadow-[var(--shadow-border)]"
            >
              <header className="border-b border-border/70 px-4 py-3">
                <p className="display text-lg">{group.label}</p>
                <p className="text-xs text-muted">
                  {group.items.length} {group.items.length === 1 ? "занятие" : "занятий"}
                </p>
              </header>
              <ul>
                {group.items.map((slot) => {
                  const meta = branchMeta(slot.session);
                  const href = courseHref(slot.session);
                  return (
                    <li key={slot.id} className="border-t border-border/60 first:border-t-0">
                      <div className="flex items-center gap-3 px-3.5 py-3 md:gap-5 md:px-4">
                        <span className="w-[4.6rem] shrink-0 text-[0.95rem] font-semibold tabular-nums">
                          {slot.time.split("–")[0] || "—"}
                        </span>
                        <span className="min-w-0 flex-1">
                          {href ? (
                            <PageLink
                              to={href}
                              className="block text-[0.98rem] font-semibold leading-snug hover:text-primary"
                            >
                              {courseTitle(slot.session)}
                            </PageLink>
                          ) : (
                            <span className="block text-[0.98rem] font-semibold leading-snug">
                              {courseTitle(slot.session)}
                            </span>
                          )}
                          <span className="mt-0.5 block text-xs text-muted">
                            {slot.session.age}
                            {slot.time.includes("–") ? ` · ${slot.time}` : ""}
                            {` · ${meta.city}, ${meta.short}`}
                          </span>
                        </span>
                        {slot.session.signup?.startsWith("http") ? (
                          <a
                            href={slot.session.signup}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-fg px-3 text-xs font-semibold text-bg hover:bg-primary"
                          >
                            Запись
                            <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
                          </a>
                        ) : href ? (
                          <PageLink
                            to={`${href}#trial`}
                            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-fg px-3 text-xs font-semibold text-bg hover:bg-primary"
                          >
                            Запись
                            <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
                          </PageLink>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        ) : (
          <p className="rounded-[1.35rem] bg-surface px-4 py-6 text-sm text-muted shadow-[var(--shadow-border)]">
            Нет групп с такими фильтрами. Сбросьте день или возраст.
          </p>
        )}
      </div>
    </section>
  );
}
