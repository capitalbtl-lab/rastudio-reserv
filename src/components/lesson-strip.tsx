"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { GroupCalLesson } from "@/data/crm-slots-core";

const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const RANGE_OPTS = [
  { id: "10", label: "±10 занятий" },
  { id: "7", label: "±7 дней" },
  { id: "30", label: "±30 дней" },
  { id: "90", label: "±90 дней" },
  { id: "180", label: "±180 дней" },
  { id: "360", label: "±360 дней" },
] as const;

export function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function toYmd(raw: string) {
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return s.slice(0, 10);
}

function parseYmd(s: string) {
  const [y, m, d] = toYmd(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function shiftYmd(iso: string, days: number) {
  const d = parseYmd(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function LessonTile({
  lesson: l,
  today,
  onEnter,
  onLeave,
}: {
  lesson: GroupCalLesson;
  today: string;
  onEnter: (el: HTMLElement, lesson: GroupCalLesson) => void;
  onLeave: () => void;
}) {
  const d = parseYmd(l.date);
  const isToday = l.date === today;
  const cancelled = l.status === 2;
  const done = l.status === 3;
  const planned = l.status === 1 || l.status === 0;
  return (
    <div
      onMouseEnter={(e) => onEnter(e.currentTarget, l)}
      onMouseLeave={onLeave}
      data-op="lesson-tile"
      data-lesson-date={l.date}
      data-lesson-id={l.lessonId || undefined}
      data-lesson-status={l.status}
      className={cn(
        "flex h-[3.35rem] w-[2.4rem] min-w-[2.4rem] cursor-default flex-col items-center justify-center rounded-lg px-0.5 text-center leading-tight shadow-[0_1px_3px_rgba(15,23,42,0.12)]",
        isToday && !cancelled && "ra-today-tile text-white",
        !isToday && done && "bg-emerald-100 text-fg ring-1 ring-emerald-400/80",
        !isToday && planned && "bg-white text-fg ring-1 ring-neutral-500/55",
        cancelled && "bg-neutral-200 text-neutral-400 ring-1 ring-neutral-300 line-through",
      )}
    >
      {isToday && !cancelled ? (
        <>
          <span className="text-[0.83rem] font-semibold tabular-nums text-white">{d.getDate()}</span>
          <span className="text-[0.6rem] font-medium text-white/85">{MONTHS_SHORT[d.getMonth()]}</span>
          <span className="text-[0.48rem] font-semibold uppercase leading-none tracking-wide text-white/90">сегодня</span>
        </>
      ) : (
        <>
          <span className={cn("text-[0.6rem] font-semibold uppercase tracking-wider", cancelled ? "text-neutral-400" : "text-neutral-500")}>{WD[(d.getDay() + 6) % 7]}</span>
          <span className="text-[0.83rem] font-semibold tabular-nums">{d.getDate()}</span>
          <span className={cn("text-[0.6rem] font-medium", cancelled ? "text-neutral-400" : "text-neutral-500")}>{MONTHS_SHORT[d.getMonth()]}</span>
        </>
      )}
    </div>
  );
}

function LessonCard({
  lesson: l,
  top,
  left,
  group,
  subject,
  teacher,
}: {
  lesson: GroupCalLesson;
  top: number;
  left: number;
  group?: string;
  subject?: string;
  teacher?: string;
}) {
  const statusRu = l.status === 3 ? "Проведено" : l.status === 2 ? "Отменено" : l.status === -1 ? "Сегодня нет занятия" : "Запланировано";
  const time = l.from && l.to ? `с ${l.from} до ${l.to}` : l.from || "";
  const mins = l.duration ? ` (${l.duration} мин.)` : "";
  const rows: [string, string][] = [
    ["Тип", l.type || "Групповое"],
    ["Статус", statusRu],
    ["Время", time ? `${time}${mins}` : "—"],
    ["Аудитория", l.room || ""],
    ["Педагог", l.teacher || teacher || ""],
    ["Предмет", l.subject || subject || ""],
    ["Группа", l.group || group || ""],
    ["Тема", l.topic || ""],
    ["Домашнее задание", l.homework || ""],
  ];
  if (l.status === 3 && (l.total || 0) > 0) rows.push(["Присутствие", `${l.attend || 0} из ${l.total}`]);
  const dateLabel = (() => {
    const [y, m, d] = l.date.split("-").map(Number);
    if (!y) return l.date;
    return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  })();
  return (
    <div
      className="pointer-events-none fixed z-[240] w-[16rem] rounded-md bg-white px-3 py-2 text-left text-[0.68rem] leading-snug text-fg shadow-[0_8px_22px_rgba(15,23,42,0.22)] ring-1 ring-black/10"
      style={{ top, left }}
    >
      <p className="mb-1 text-[0.62rem] font-semibold tracking-wide text-muted">{dateLabel}</p>
      <dl className="space-y-0.5">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[5.2rem_1fr] gap-x-2">
              <dt className="text-[0.62rem] text-muted">{k}</dt>
              <dd className={cn("font-medium", k === "Тема" || k === "Домашнее задание" ? "whitespace-pre-wrap" : "")}>{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

export function LessonStrip({
  lessons,
  group,
  subject,
  teacher,
  title = "Расписание занятий",
  className,
}: {
  lessons: GroupCalLesson[];
  group?: string;
  subject?: string;
  teacher?: string;
  title?: string;
  className?: string;
}) {
  const today = todayYmd();
  const [range, setRange] = useState<(typeof RANGE_OPTS)[number]["id"]>("10");
  const [tip, setTip] = useState<{ lesson: GroupCalLesson; top: number; left: number } | null>(null);
  const all = useMemo(() => [...lessons].sort((a, b) => a.date.localeCompare(b.date)), [lessons]);
  const { past, future, todayHit } = useMemo(() => {
    let pool = all;
    if (range !== "10") {
      const days = Number(range);
      const from = shiftYmd(today, -days);
      const to = shiftYmd(today, days);
      pool = all.filter((l) => l.date >= from && l.date <= to);
    }
    const pastAll = pool.filter((l) => l.date < today);
    const futureAll = pool.filter((l) => l.date > today);
    const todayHit = pool.find((l) => l.date === today) || null;
    if (range === "10") {
      return { past: pastAll.slice(-10), future: futureAll.slice(0, 10), todayHit };
    }
    return { past: pastAll, future: futureAll, todayHit };
  }, [all, range, today]);
  const shown = past.length + future.length + (todayHit ? 1 : 0);

  function showTip(el: HTMLElement, lesson: GroupCalLesson) {
    const r = el.getBoundingClientRect();
    const width = 256;
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    let top = r.bottom + 8;
    if (top + 260 > window.innerHeight) top = Math.max(8, r.top - 268);
    setTip({ lesson, top, left });
  }

  return (
    <div className={cn("min-w-0", className)} data-op="lesson-strip">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted">{title}</p>
        <div className="flex items-center gap-2">
          <p className="text-[0.7rem] text-muted">
            {shown} из {all.length}
          </p>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as (typeof RANGE_OPTS)[number]["id"])}
            className="h-8 rounded-[4px] bg-white px-2 text-[0.72rem] font-medium text-fg ring-1 ring-black/8"
          >
            {RANGE_OPTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {past.map((l) => (
          <LessonTile key={`${l.date}-${l.lessonId || l.from}`} lesson={l} today={today} onEnter={showTip} onLeave={() => setTip(null)} />
        ))}
        {todayHit ? (
          <LessonTile key={`${todayHit.date}-${todayHit.lessonId || todayHit.from}`} lesson={todayHit} today={today} onEnter={showTip} onLeave={() => setTip(null)} />
        ) : (
          <div className="ra-today-tile flex h-[3.35rem] w-[2.4rem] min-w-[2.4rem] flex-col items-center justify-center rounded-lg px-0.5 text-center text-white" title="Сегодня">
            <span className="text-[0.48rem] font-semibold uppercase leading-none tracking-wide text-white/95">сегодня</span>
            <span className="text-[0.83rem] font-semibold tabular-nums">{Number(today.slice(8))}</span>
            <span className="text-[0.6rem] font-medium text-white/90">{MONTHS_SHORT[Number(today.slice(5, 7)) - 1]}</span>
          </div>
        )}
        {future.map((l) => (
          <LessonTile key={`${l.date}-${l.lessonId || l.from}`} lesson={l} today={today} onEnter={showTip} onLeave={() => setTip(null)} />
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-[0.68rem] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-100 ring-1 ring-emerald-400/80" /> проведено
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-white ring-1 ring-neutral-400" /> запланировано
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-neutral-200 ring-1 ring-neutral-300" /> отменено
        </span>
      </p>
      {tip
        ? createPortal(
            <LessonCard lesson={tip.lesson} top={tip.top} left={tip.left} group={group} subject={subject} teacher={teacher} />,
            document.body,
          )
        : null}
    </div>
  );
}

export { LessonStrip as GroupLessonStrip };
