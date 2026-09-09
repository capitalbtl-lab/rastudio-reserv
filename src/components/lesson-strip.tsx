"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, HelpCircle, MinusCircle, Pause, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupCalLesson, LessonRosterPerson, LessonTileMark, LessonTileTone } from "@/data/crm-slots-core";
import { mergeLessonRoster, lessonRestLeft, maskHm, maskRuDate, pupilNameOk, lessonTileTone, lessonTileMark } from "@/data/crm-slots-core";
import { adminSchedule } from "@/data/admin-schedule";
import { RA_POP } from "@/data/admin-ui";
import { RaSelect } from "@/components/ra-select";

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

function isOneOffLesson(l: GroupCalLesson) {
  const t = Number(l.typeId || 0);
  return t === 3 || t === 1 || t === 4 || t === 5 || t === 10 || t === 11 || /пробн|отработ|вводн|индивид/i.test(String(l.type || ""));
}

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

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function addMins(hhmm: string, mins: number) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const t = ((h * 60 + m + Number(mins || 0)) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function ruDate(iso: string) {
  const [y, m, d] = toYmd(iso).split("-");
  if (!y) return iso;
  return `${d}.${m}.${y}`;
}

const TILE_TONE: Record<LessonTileTone, string> = {
  today: "ra-today-tile text-white",
  planned: "bg-[#f3f3f4] text-fg ring-1 ring-neutral-300",
  plannedFree: "bg-[#fff3d6] text-fg ring-1 ring-[#f8ac59]/80",
  plannedNoCtt: "bg-white text-fg ring-1 ring-neutral-400",
  prepaid: "bg-[#d9f3ec] text-[#0e7c66] ring-1 ring-[#1ab394]/70",
  donePaid: "bg-[#d9f3ec] text-fg ring-1 ring-[#1ab394]/80",
  doneDebt: "bg-[#ffc9c9] text-[#c0392b] ring-1 ring-[#ed5565]/80",
  doneFree: "bg-[#dff6f7] text-fg ring-1 ring-[#23c6c8]/80",
  missDebt: "bg-[#ffc9c9] text-[#c0392b] ring-1 ring-[#ed5565]/80",
  missFree: "bg-[#ffe08a] text-fg ring-1 ring-amber-500/80",
  missPaid: "bg-[#ffe08a] text-[#c0392b] ring-1 ring-[#ed5565]/70",
  overdue: "bg-[#f3f3f4] text-muted ring-1 ring-dashed ring-[#ed5565]",
  paused: "bg-[#f3f3f4] text-neutral-400 ring-1 ring-neutral-300",
  prepaidPaused: "bg-[#d9f3ec] text-neutral-500 ring-1 ring-[#1ab394]/40",
  cancelled: "bg-[#f3f3f4] text-neutral-400 ring-1 ring-neutral-300",
};

const TILE_MARK_CLASS = "absolute top-0.5 left-1/2 z-[1] -translate-x-1/2 opacity-50";

function TileMark({ mark, danger }: { mark: LessonTileMark; danger?: boolean }) {
  if (!mark) return null;
  const cls = cn(TILE_MARK_CLASS, danger ? "text-[#ed5565]" : "text-current");
  if (mark === "check") return <Check className={cn(cls, "size-2.5")} strokeWidth={3} />;
  if (mark === "times") return <X className={cn(cls, "size-2.5")} strokeWidth={3} />;
  if (mark === "question") return <HelpCircle className={cn(cls, "size-2.5 text-[#ed5565]")} strokeWidth={2.5} />;
  if (mark === "pause") return <Pause className={cn(cls, "size-2.5")} strokeWidth={2.5} />;
  if (mark === "minus") return <MinusCircle className={cn(cls, "size-2.5")} strokeWidth={2.5} />;
  return null;
}

const TILE_LEGEND: { tone: LessonTileTone; mark: LessonTileMark; danger?: boolean; label: string }[] = [
  { tone: "planned", mark: "", label: "Запланирован" },
  { tone: "plannedFree", mark: "", label: "Запланирован бесплатный" },
  { tone: "plannedNoCtt", mark: "", label: "Запланирован без абонемента" },
  { tone: "prepaid", mark: "", label: "Предоплачен" },
  { tone: "donePaid", mark: "check", label: "Проведён и оплачен" },
  { tone: "doneDebt", mark: "check", danger: true, label: "Проведён в долг" },
  { tone: "missDebt", mark: "times", danger: true, label: "Пропуск в долг" },
  { tone: "missFree", mark: "times", label: "Бесплатный пропуск" },
  { tone: "missPaid", mark: "times", danger: true, label: "Пропуск оплач." },
  { tone: "overdue", mark: "question", label: "Забыли провести?" },
  { tone: "paused", mark: "pause", label: "Приостановлен клиентом" },
  { tone: "cancelled", mark: "minus", label: "Отменён" },
  { tone: "doneFree", mark: "check", label: "Проведен без списания (бесплатный)" },
  { tone: "prepaidPaused", mark: "pause", label: "Предоплачен и приостановлен" },
];

function LessonTile({
  lesson: l,
  today,
  customerId,
  onEnter,
  onLeave,
  onClick,
}: {
  lesson: GroupCalLesson;
  today: string;
  customerId?: number;
  onEnter: (el: HTMLElement, lesson: GroupCalLesson) => void;
  onLeave: () => void;
  onClick?: (el: HTMLElement, lesson: GroupCalLesson) => void;
}) {
  const d = parseYmd(l.date);
  const tone = lessonTileTone(l, today, customerId);
  const mark = lessonTileMark(tone);
  const cancelled = tone === "cancelled" || tone === "paused" || tone === "prepaidPaused";
  const isToday = tone === "today";
  const dangerMark = tone === "missPaid" || tone === "missDebt" || tone === "doneDebt";
  return (
    <div
      onMouseEnter={(e) => onEnter(e.currentTarget, l)}
      onMouseLeave={onLeave}
      onClick={(e) => onClick?.(e.currentTarget, l)}
      data-op="lesson-tile"
      data-tile-tone={tone}
      data-lesson-date={l.date}
      data-lesson-id={l.lessonId || undefined}
      data-lesson-status={l.status}
      data-lesson-type={l.typeId || undefined}
      title={l.type ? `${l.type} ${l.from || ""}`.trim() : undefined}
      className={cn(
        "relative flex h-[3.35rem] w-[2.76rem] min-w-[2.76rem] cursor-pointer flex-col items-center justify-center rounded-lg px-0.5 pt-2 text-center leading-tight shadow-[0_1px_3px_rgba(15,23,42,0.12)]",
        TILE_TONE[tone],
      )}
    >
      <TileMark mark={mark} danger={dangerMark} />
      {isToday ? (
        <>
          <span className="text-[0.83rem] font-semibold tabular-nums text-white">{d.getDate()}</span>
          <span className="text-[0.48rem] font-semibold uppercase leading-none tracking-wide text-white/90">сегодня</span>
          <span className="text-[0.6rem] font-medium text-white/85">{MONTHS_SHORT[d.getMonth()]}</span>
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
  people,
  pinned,
  busy,
  error,
  onClose,
  onOpen,
  onOpenPupil,
  onConduct,
  onCancel,
  onReturn,
  onEnter,
  onLeave,
}: {
  lesson: GroupCalLesson;
  top: number;
  left: number;
  group?: string;
  subject?: string;
  teacher?: string;
  people?: LessonRosterPerson[];
  pinned?: boolean;
  busy?: boolean;
  error?: string;
  onClose?: () => void;
  onOpen?: () => void;
  onOpenPupil?: (id: number) => void;
  onConduct?: () => void;
  onCancel?: () => void;
  onReturn?: () => void;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const done = l.status === 3;
  const cancelled = l.status === 2;
  const statusRu = done ? "проведен" : cancelled ? "отменен" : l.status === -1 ? "сегодня нет занятия" : "запланирован";
  const time = l.from && l.to ? `с ${l.from} до ${l.to}` : l.from || "";
  const mins = l.duration ? ` (${l.duration} мин.)` : "";
  const rows: [string, string][] = [
    ["Тип", l.type || "Групповое"],
    ["Время", time ? `${time}${mins}` : "—"],
    ["Аудитория", l.room || "(не задан)"],
    ["Педагог", l.teacher || teacher || "(не задан)"],
    ["Предмет", l.subject || subject || ""],
    ["Группа", l.group || group || ""],
    ["Тема", l.topic || ""],
    ["Домашнее задание", l.homework || ""],
  ];
  if (done && (l.total || 0) > 0) rows.push(["Присутствие", `${l.attend || 0} из ${l.total}`]);
  const roster = mergeLessonRoster(l, people);
  const canAct = Boolean(onOpen);
  const btn = "h-8 rounded-lg bg-[#d8dce3] text-[0.75rem] font-semibold text-[#5c636c] disabled:opacity-45";
  return (
    <div
      className={cn("fixed z-[240] w-[24rem] p-3 text-left text-[0.78rem] leading-snug text-fg", RA_POP)}
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-[0.72rem] font-semibold text-fg">
          {l.type || "Групповое"} — {statusRu}
        </p>
        {pinned ? (
          <button type="button" className="text-lg leading-none text-muted hover:text-fg" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        ) : null}
      </div>
      <p className="mb-1.5 text-[0.68rem] text-muted">{ruDate(l.date)}</p>
      <dl className="space-y-0.5">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[5.4rem_1fr] gap-x-2">
              <dt className="text-[0.68rem] text-muted">{k}</dt>
              <dd className={cn("font-medium", k === "Тема" || k === "Домашнее задание" ? "whitespace-pre-wrap" : v === "(не задан)" ? "text-muted" : "")}>{v}</dd>
            </div>
          ))}
      </dl>
      {roster.length ? (
        <ol className="pretty-scroll mt-2 max-h-64 space-y-0.5 overflow-y-auto border-t border-black/8 pt-2 text-[0.75rem]" data-op="lesson-pupils">
          {roster.map((p, i) => {
            const name = pupilNameOk(p.name) || `клиент ${p.customerId}`;
            const left = lessonRestLeft(p.rest);
            const tone = left == null ? "" : left > 0 ? "text-emerald-700" : "text-red-700";
            const amt = done
              ? Number(p.amount || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : "";
            const line = (
              <span className={cn("flex min-w-0 flex-1 items-center gap-1.5", p.attend ? tone || "text-fg" : "text-muted")}>
                {p.attend ? <span className="shrink-0 text-[0.7rem] text-emerald-600">✓</span> : <span className="w-3 shrink-0" />}
                <span className="min-w-0 truncate">{name}</span>
                {!amt && p.rest ? <span className="shrink-0 tabular-nums">({p.rest})</span> : null}
                {amt ? <span className="ml-auto shrink-0 tabular-nums text-fg">{amt}</span> : null}
              </span>
            );
            return (
              <li key={p.customerId || i} className="flex min-w-0 items-center gap-1.5">
                <span className="w-4 shrink-0 text-[0.68rem] text-muted">{i + 1}.</span>
                {onOpenPupil && p.customerId ? (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 truncate text-left hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPupil(p.customerId);
                    }}
                  >
                    {p.attend ? line : <s className="flex min-w-0 flex-1 text-muted">{line}</s>}
                  </button>
                ) : p.attend ? (
                  <span className="flex min-w-0 flex-1">{line}</span>
                ) : (
                  <s className="flex min-w-0 flex-1 text-muted">{line}</s>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}
      {error ? <p className="mt-2 text-[0.75rem] text-red-600">{error}</p> : null}
      {canAct ? (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <button type="button" disabled={busy} className={btn} onClick={onOpen}>
            Открыть
          </button>
          <button type="button" disabled={busy || done} className={btn} onClick={onConduct}>
            {busy ? "…" : "Провести"}
          </button>
          {done ? (
            <button type="button" disabled={busy} className={btn} onClick={onReturn}>
              Вернуть
            </button>
          ) : (
            <button type="button" disabled={busy || cancelled} className={btn} onClick={onCancel}>
              Отменить
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

type LessonForm = {
  id: number;
  date: string;
  from: string;
  to: string;
  duration: number;
  roomId: number;
  groupIds: number[];
  customerIds: number[];
  customers: LessonCustomer[];
  subjectId: number;
  teacherIds: number[];
  topic: string;
  homework: string;
  note: string;
  status?: number;
};

type LessonCustomer = {
  id: number;
  name: string;
  attend?: boolean;
  amount?: number;
  baseAmount?: number;
  cttId?: number;
  reasonId?: number;
  reason?: string;
  grade?: string;
  homeworkGrade?: string;
  note?: string;
  rest?: string;
};

const FIELD = "mt-0.5 h-7 w-full rounded-lg bg-white px-2 text-[0.78rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none";
const LBL = "block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80";
const GRADE_OPTS = ["5", "4", "3", "2", "зачёт"];
const MISS_REASONS = [
  { id: 1, label: "По любой причине (100% списания)", pct: 100 },
  { id: 2, label: "По решению руководства (0% списания)", pct: 0 },
] as const;
const ATTEND_COLS_KEY = "ra_lesson_attend_cols";
const ATTEND_COL_DEF: Record<string, number> = { name: 220, amount: 92, reason: 148, hw: 52, note: 56, del: 28 };
const ATTEND_COL_MIN: Record<string, number> = { name: 120, amount: 72, reason: 88, hw: 40, note: 40, del: 24 };
const ATTEND_COL_KEYS = ["name", "amount", "reason", "hw", "note", "del"] as const;

function readAttendCols(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(ATTEND_COLS_KEY) || "{}") as Record<string, number>;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeAttendCols(w: Record<string, number>) {
  try {
    localStorage.setItem(ATTEND_COLS_KEY, JSON.stringify(w));
  } catch {
    /* */
  }
}

function AttendColHandle({ onDown }: { onDown: (e: PointerEvent<HTMLSpanElement>) => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина столбца"
      title="Потяните, чтобы изменить ширину"
      className="absolute right-0 top-0 z-20 flex h-full w-2.5 cursor-col-resize touch-none items-center justify-center"
      onPointerDown={onDown}
    >
      <span className="pointer-events-none h-[1.1rem] w-px rounded-full bg-black/20 group-hover/col:bg-primary/70" />
    </span>
  );
}

const MONTHS_FULL = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function DateCal({ value, onPick, children }: { value: string; onPick: (iso: string) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const iso = toYmd(value);
  const selected = parseYmd(iso || todayYmd());
  const [viewY, setViewY] = useState(selected.getFullYear());
  const [viewM, setViewM] = useState(selected.getMonth());
  useEffect(() => {
    if (!open) return;
    setViewY(selected.getFullYear());
    setViewM(selected.getMonth());
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, iso]);
  const first = new Date(viewY, viewM, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(start).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayYmd();
  const sel = iso;
  function shiftMonth(delta: number) {
    const d = new Date(viewY, viewM + delta, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  }
  return (
    <div ref={box} className="relative mt-0.5" data-op="lesson-date-cal">
      {children}
      <button
        type="button"
        className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded p-0.5 text-muted hover:bg-black/[0.05] hover:text-fg"
        aria-label="Календарь"
        title="Календарь"
        onClick={() => setOpen((v) => !v)}
      >
        <Calendar className="size-3.5" />
      </button>
      {open ? (
        <div className={cn("absolute left-0 top-full z-40 mt-1 w-[16.5rem] p-2", RA_POP)} onMouseDown={(e) => e.stopPropagation()}>
          <div className="mb-1.5 flex items-center justify-between px-1">
            <button type="button" className="grid size-6 place-items-center rounded-md text-muted hover:bg-black/[0.05] hover:text-fg" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
              ‹
            </button>
            <p className="text-[0.78rem] font-semibold capitalize text-fg">
              {MONTHS_FULL[viewM]} {viewY}
            </p>
            <button type="button" className="grid size-6 place-items-center rounded-md text-muted hover:bg-black/[0.05] hover:text-fg" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[0.62rem] font-medium uppercase text-muted">
            {WD.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-0.5 grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <span key={`e${i}`} />;
              const ymd = `${viewY}-${String(viewM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSel = ymd === sel;
              const isToday = ymd === today;
              return (
                <button
                  key={ymd}
                  type="button"
                  className={cn(
                    "grid h-7 place-items-center rounded-md text-[0.75rem] font-medium",
                    isSel ? "bg-primary text-white" : isToday ? "bg-sky-100 text-sky-800" : "text-fg hover:bg-black/[0.05]",
                  )}
                  onClick={() => {
                    onPick(ymd);
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TeacherDrop({
  teachers,
  ids,
  onToggle,
}: {
  teachers: { id: number; name: string }[];
  ids: number[];
  onToggle: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const label = teachers.filter((t) => ids.includes(t.id)).map((t) => t.name).join(", ");
  return (
    <div ref={box} className="relative" data-op="lesson-teachers">
      <button type="button" className={cn(FIELD, "flex items-center justify-between gap-2 text-left")} onClick={() => setOpen((v) => !v)}>
        <span className={cn("truncate", !label && "text-muted")}>{label || "— педагоги —"}</span>
        <span className="text-muted">▾</span>
      </button>
      {open ? (
        <div className={cn("absolute z-50 mt-1 max-h-44 min-w-full w-max overflow-y-auto p-1", RA_POP)}>
          {teachers.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[0.78rem] hover:bg-black/[0.04]">
              <input type="checkbox" checked={ids.includes(t.id)} onChange={() => onToggle(t.id)} />
              {t.name}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LessonEdit({
  branchId,
  groupId,
  seed,
  conduct,
  onClose,
  onSaved,
}: {
  branchId: number;
  groupId: number;
  seed: GroupCalLesson;
  conduct?: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<GroupCalLesson>) => void;
}) {
  const lessonId = seed.lessonId || 0;
  const seedForm: LessonForm = {
    id: lessonId,
    date: toYmd(seed.date),
    from: seed.from || "",
    to: seed.to || "",
    duration: seed.duration || 90,
    roomId: seed.roomId || 0,
    groupIds: seed.groupIds?.length ? seed.groupIds : groupId ? [groupId] : [],
    customerIds: seed.customerIds || [],
    customers: [],
    subjectId: seed.subjectId || 0,
    teacherIds: seed.teacherIds || [],
    topic: seed.topic || "",
    homework: seed.homework || "",
    note: seed.note || "",
    status: seed.status,
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<LessonForm>(seedForm);
  const [rooms, setRooms] = useState<{ id: number; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: number; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: number; name: string }[]>([]);
  const [openNotes, setOpenNotes] = useState<Record<number, true>>({});
  const [colW, setColW] = useState<Record<string, number>>({});
  const colWRef = useRef(colW);
  colWRef.current = colW;

  useEffect(() => {
    setColW(readAttendCols());
    return () => writeAttendCols(colWRef.current);
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void adminSchedule({
      data: {
        token: token(),
        action: "lessonGet",
        branchId,
        groupId,
        lessonId,
        date: seed.date,
        time: seed.from,
        timeTo: seed.to,
        duration: seed.duration,
        roomId: seed.roomId,
        subjectId: seed.subjectId,
        teacherIds: seed.teacherIds,
        topic: seed.topic,
        note: seed.note,
      } as never,
    }).then((res) => {
      if (!live) return;
      if (!res.ok) {
        setError(("error" in res && res.error) || "");
        setLoading(false);
        return;
      }
      const pack = res as {
        lesson: LessonForm;
        rooms: { id: number; name: string }[];
        teachers: { id: number; name: string }[];
        subjects: { id: number; name: string }[];
        groups: { id: number; name: string }[];
      };
      const customers = (pack.lesson.customers || []).map((c) => ({
        ...c,
        attend: c.attend !== false,
        amount: Number(c.amount) || 0,
        baseAmount: Number(c.amount) || 0,
      }));
      setForm({
        ...pack.lesson,
        date: toYmd(pack.lesson.date),
        groupIds: pack.lesson.groupIds?.length ? pack.lesson.groupIds : groupId ? [groupId] : [],
        customerIds: pack.lesson.customerIds || customers.map((c) => c.id),
        customers,
        teacherIds: pack.lesson.teacherIds || [],
        homework: pack.lesson.homework || "",
      });
      setRooms(pack.rooms || []);
      setTeachers(pack.teachers || []);
      setSubjects(pack.subjects || []);
      setGroups(pack.groups || []);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [branchId, groupId, lessonId, seed.date, seed.from]);

  useEffect(() => {
    const qq = q.trim();
    if (qq.length < 2) {
      setHits([]);
      return;
    }
    const tmr = window.setTimeout(() => {
      void adminSchedule({ data: { token: token(), action: "customersSearch", q: qq, branchId } as never }).then((res) => {
        if (!res.ok || !("items" in res) || !Array.isArray(res.items)) return;
        setHits(
          (res.items as { crmId?: number; id?: number; child?: string; parent?: string }[])
            .map((x) => ({
              id: Number(x.crmId || x.id || 0),
              name: String(x.child || x.parent || `клиент ${x.crmId || x.id}`),
            }))
            .filter((x) => x.id),
        );
      });
    }, 280);
    return () => window.clearTimeout(tmr);
  }, [q, branchId]);

  function set<K extends keyof LessonForm>(key: K, value: LessonForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }
  function patchCustomer(id: number, patch: Partial<LessonCustomer>) {
    setForm((f) => (f ? { ...f, customers: f.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : f));
  }
  function removeCustomer(id: number) {
    setForm((f) =>
      f
        ? {
            ...f,
            customerIds: f.customerIds.filter((x) => x !== id),
            customers: f.customers.filter((c) => c.id !== id),
          }
        : f,
    );
  }
  const dateShown = /^\d{4}-\d{2}-\d{2}$/.test(form.date) ? ruDate(form.date) : form.date;
  const colPx = (key: string) => {
    const n = Number(colW[key]);
    return n > 0 ? n : ATTEND_COL_DEF[key];
  };
  function closeForm() {
    writeAttendCols(colWRef.current);
    onClose();
  }
  function resizeCol(key: string, e: PointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const startW = colPx(key);
    const min = ATTEND_COL_MIN[key] || 40;
    const prevUser = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const move = (ev: globalThis.PointerEvent) => {
      const next = Math.round(Math.min(280, Math.max(min, startW + ev.clientX - startX)));
      setColW((cur) => ({ ...cur, [key]: next }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.userSelect = prevUser;
      document.body.style.cursor = prevCursor;
      writeAttendCols(colWRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  async function save(asConduct = false) {
    if (!form) return;
    setSaving(true);
    setError("");
    const res = await adminSchedule({
      data: {
        token: token(),
        action: "lessonSave",
        branchId,
        groupId,
        lessonId: form.id,
        date: form.date,
        time: form.from,
        timeTo: form.to,
        duration: form.duration,
        roomId: form.roomId,
        groupIds: form.groupIds,
        customerIds: form.customerIds,
        subjectId: form.subjectId,
        teacherIds: form.teacherIds,
        topic: form.topic,
        homework: form.homework,
        note: form.note,
        customers: form.customers,
        statusId: asConduct || form.status === 3 ? 3 : form.status || 1,
      } as never,
    });
    setSaving(false);
    if (!res.ok) {
      setError(("error" in res && res.error) || "Не удалось сохранить занятие.");
      return;
    }
    const room = rooms.find((r) => r.id === form.roomId)?.name || "";
    const teacher = teachers.filter((t) => form.teacherIds.includes(t.id)).map((t) => t.name).join(", ");
    const subject = subjects.find((s) => s.id === form.subjectId)?.name || "";
    const groupName = groups.find((g) => form.groupIds.includes(g.id))?.name || "";
    onSaved({
      date: form.date,
      from: form.from,
      to: form.to,
      duration: form.duration,
      room,
      roomId: form.roomId,
      teacher,
      teacherIds: form.teacherIds,
      subject,
      subjectId: form.subjectId,
      group: groupName,
      groupIds: form.groupIds,
      topic: form.topic,
      note: form.note,
      homework: form.homework,
      customerIds: form.customerIds,
      pupils: form.customers.map((c) => ({
        customerId: c.id,
        name: c.name,
        attend: c.attend !== false,
        amount: Number(c.amount) || undefined,
        cttId: c.cttId,
        reason: c.reason,
        grade: c.grade,
        homeworkGrade: c.homeworkGrade,
        note: c.note,
      })),
      attend: form.customers.filter((c) => c.attend !== false).length,
      total: form.customers.length,
      status: asConduct || form.status === 3 ? 3 : form.status,
      lessonId: Number((res as { lessonId?: number }).lessonId || form.id || 0) || form.id,
    });
    closeForm();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeForm();
      }}
      data-op="lesson-edit"
    >
      <div className={cn("w-full max-w-[40rem] p-4", RA_POP, "overflow-visible")} style={{ background: "#e8f3fc" }} onMouseDown={(e) => e.stopPropagation()} data-op={conduct ? "lesson-conduct" : "lesson-edit-card"}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-fg">Групповое — {conduct ? "провести" : form.status === 3 ? "проведён" : form.status === 2 ? "отменён" : "занятие"}</h3>
          <button type="button" className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white" onClick={closeForm}>
            Закрыть
          </button>
        </div>
        {loading ? <p className="mt-2 text-[0.75rem] text-muted">Открываю занятие…</p> : null}
        <div className="mt-3 grid gap-2">
          <div className="grid grid-cols-[6.8rem_3.9rem_3.1rem_3.4rem_minmax(6.5rem,0.9fr)_minmax(9rem,1.1fr)] items-end gap-x-1.5" data-op="lesson-when">
            <label className={LBL}>
              Дата
              <DateCal value={form.date} onPick={(iso) => set("date", iso)}>
                <input
                  value={dateShown}
                  onChange={(e) => {
                    const next = maskRuDate(e.target.value);
                    set("date", next.length === 10 ? toYmd(next) : next);
                  }}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="дд.мм.гггг"
                  className={cn(FIELD, "mt-0 px-1.5 pr-7 text-center")}
                />
              </DateCal>
            </label>
            <label className={LBL}>
              Время
              <input
                value={form.from}
                onChange={(e) => {
                  const from = maskHm(e.target.value);
                  setForm((f) => (f ? { ...f, from, to: addMins(from, f.duration) || f.to } : f));
                }}
                inputMode="numeric"
                maxLength={5}
                placeholder="18:00"
                className={cn(FIELD, "px-1 text-center")}
              />
            </label>
            <label className={LBL}>
              Мин
              <input
                type="number"
                min={0}
                max={1000}
                value={form.duration}
                onChange={(e) => {
                  const duration = Number(e.target.value) || 0;
                  setForm((f) => (f ? { ...f, duration, to: addMins(f.from, duration) || f.to } : f));
                }}
                className={cn(FIELD, "px-1 text-center")}
              />
            </label>
            <label className={LBL}>
              До
              <input value={form.to} readOnly className={cn(FIELD, "bg-white/70 px-1 text-center")} />
            </label>
            <label className={LBL}>
              Аудитория
              <RaSelect value={form.roomId ? String(form.roomId) : ""} placeholder="— не задана —" className={FIELD} options={rooms.map((r) => ({ value: String(r.id), label: r.name }))} onChange={(v) => set("roomId", Number(v) || 0)} />
            </label>
            <label className={LBL}>
              Педагог
              <TeacherDrop
                teachers={teachers}
                ids={form.teacherIds}
                onToggle={(id) => set("teacherIds", form.teacherIds.includes(id) ? form.teacherIds.filter((x) => x !== id) : [...form.teacherIds, id])}
              />
            </label>
          </div>
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(7.5rem,0.85fr)] items-end gap-1.5" data-op="lesson-place">
            <label className={LBL}>
              Группа
              <RaSelect value={String(form.groupIds[0] || "")} placeholder="— группа —" className={FIELD} menuMinWidth={280} options={groups.map((g) => ({ value: String(g.id), label: g.name }))} onChange={(v) => set("groupIds", Number(v) ? [Number(v)] : [])} />
            </label>
            <label className={LBL}>
              Предмет
              <RaSelect value={form.subjectId ? String(form.subjectId) : ""} placeholder="— предмет —" className={FIELD} menuMinWidth={280} options={subjects.map((s) => ({ value: String(s.id), label: s.name }))} onChange={(v) => set("subjectId", Number(v) || 0)} />
            </label>
            <label className={LBL} data-op="lesson-who">
              Клиент
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="добавить клиента" className={FIELD} />
              {hits.length ? (
                <ul className={cn("mt-1 max-h-36 overflow-y-auto py-1", RA_POP)}>
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-[#eef4fb]"
                        onClick={() => {
                          setForm((f) => {
                            if (!f || f.customerIds.includes(h.id)) return f;
                            return {
                              ...f,
                              customerIds: [...f.customerIds, h.id],
                              customers: [...f.customers, { ...h, attend: true, amount: 0, baseAmount: 0 }],
                            };
                          });
                          setQ("");
                          setHits([]);
                        }}
                      >
                        {h.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
          </div>
          {form.customers.length ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">Кто был?</p>
                <button
                  type="button"
                  className="text-[0.72rem] text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    const allOn = form.customers.every((c) => c.attend !== false);
                    setForm((f) => (f ? { ...f, customers: f.customers.map((c) => ({ ...c, attend: !allOn })) } : f));
                  }}
                >
                  {form.customers.every((c) => c.attend !== false) ? "снять все" : "выбрать все"}
                </button>
              </div>
              <div className="mt-1 max-h-[11.5rem] overflow-auto rounded-xl bg-white ring-1 ring-black/8" data-op="lesson-attend">
                <table className="w-full text-left text-[0.75rem]" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    {ATTEND_COL_KEYS.map((k) => (
                      <col key={k} style={{ width: colPx(k) }} />
                    ))}
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-white text-[0.62rem] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="group/col relative px-2 py-1.5 font-medium">
                        Состояние клиента
                        <AttendColHandle onDown={(e) => resizeCol("name", e)} />
                      </th>
                      <th className="group/col relative px-1 py-1.5 font-medium" title="Списание">
                        Списание
                        <AttendColHandle onDown={(e) => resizeCol("amount", e)} />
                      </th>
                      <th className="group/col relative px-1 py-1.5 font-medium" title="Оценка / Причина">
                        Оц. / причина
                        <AttendColHandle onDown={(e) => resizeCol("reason", e)} />
                      </th>
                      <th className="group/col relative px-1 py-1.5 font-medium" title="Оценка за ДЗ">
                        ДЗ
                        <AttendColHandle onDown={(e) => resizeCol("hw", e)} />
                      </th>
                      <th className="group/col relative px-1 py-1.5 font-medium" title="Примечание">
                        прим.
                        <AttendColHandle onDown={(e) => resizeCol("note", e)} />
                      </th>
                      <th className="px-0.5 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.customers.map((c) => {
                      const zero = /(?:^|[^\d])0 ост/.test(String(c.rest || "")) || c.rest?.startsWith("0 ");
                      const showNote = Boolean(c.note) || openNotes[c.id];
                      return (
                        <tr key={c.id} className={cn("border-t border-black/6", c.attend === false && "bg-amber-50")}>
                          <td className="px-2 py-1">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                className="shrink-0"
                                checked={c.attend !== false}
                                onChange={() => {
                                  if (c.attend === false) {
                                    patchCustomer(c.id, { attend: true, reason: "", reasonId: 0, amount: c.baseAmount || c.amount || 0 });
                                  } else {
                                    patchCustomer(c.id, {
                                      attend: false,
                                      reason: MISS_REASONS[0].label,
                                      reasonId: MISS_REASONS[0].id,
                                    });
                                  }
                                }}
                              />
                              <span className="min-w-0 truncate">
                                <span className={cn("font-medium", zero || c.attend === false ? "text-rose-600" : "text-sky-800")}>{c.name}</span>
                                {c.rest ? <span className="ml-1 text-[0.65rem] text-muted">({c.rest})</span> : null}
                              </span>
                            </label>
                          </td>
                          <td className="px-1 py-1">
                            <span className="flex items-center gap-0.5">
                              <input
                                type="number"
                                step="0.01"
                                value={c.amount ?? ""}
                                onChange={(e) => patchCustomer(c.id, { amount: Number(e.target.value) || 0, baseAmount: Number(e.target.value) || 0 })}
                                className="h-7 w-full min-w-0 rounded-md bg-white px-1 text-center tabular-nums ring-1 ring-black/10"
                              />
                              <span className="text-[0.65rem] text-muted">р.</span>
                            </span>
                          </td>
                          <td className="px-1 py-1">
                            {c.attend === false ? (
                              <select
                                value={c.reasonId || MISS_REASONS.find((r) => r.label === c.reason)?.id || ""}
                                onChange={(e) => {
                                  const id = Number(e.target.value) || 0;
                                  const hit = MISS_REASONS.find((r) => r.id === id);
                                  patchCustomer(c.id, {
                                    reasonId: id,
                                    reason: hit?.label || "",
                                    amount: hit?.pct === 0 ? 0 : c.baseAmount || c.amount || 0,
                                  });
                                }}
                                className="h-7 w-full min-w-0 rounded-md bg-white px-0.5 text-[0.65rem] ring-1 ring-black/10"
                              >
                                <option value="">причина</option>
                                {MISS_REASONS.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select value={c.grade || ""} onChange={(e) => patchCustomer(c.id, { grade: e.target.value })} className="h-7 w-full min-w-0 rounded-md bg-white px-0.5 text-center text-[0.72rem] ring-1 ring-black/10">
                                <option value="" />
                                {GRADE_OPTS.map((g) => (
                                  <option key={g} value={g}>
                                    {g}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-1 py-1">
                            <select value={c.homeworkGrade || ""} onChange={(e) => patchCustomer(c.id, { homeworkGrade: e.target.value })} className="h-7 w-full min-w-0 rounded-md bg-white px-0.5 text-center text-[0.72rem] ring-1 ring-black/10">
                              <option value="" />
                              {GRADE_OPTS.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1 py-1">
                            {showNote ? (
                              <input
                                value={c.note || ""}
                                placeholder="прим."
                                onChange={(e) => patchCustomer(c.id, { note: e.target.value })}
                                className="h-7 w-full min-w-0 rounded-md bg-white px-1.5 text-[0.72rem] ring-1 ring-black/10"
                              />
                            ) : (
                              <button
                                type="button"
                                className="grid size-7 place-items-center rounded-md text-base font-semibold text-muted ring-1 ring-black/10 hover:bg-black/[0.04] hover:text-fg"
                                aria-label="прим."
                                title="примечание"
                                onClick={() => setOpenNotes((m) => ({ ...m, [c.id]: true }))}
                              >
                                +
                              </button>
                            )}
                          </td>
                          <td className="px-0.5 py-1">
                            <button type="button" className="grid size-6 place-items-center rounded-full text-muted hover:bg-rose-50 hover:text-rose-600" aria-label="Удалить ученика" onClick={() => removeCustomer(c.id)}>
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <label className={LBL}>
            Тема
            <input value={form.topic} onChange={(e) => set("topic", e.target.value)} className={FIELD} />
          </label>
          <div className="grid grid-cols-2 gap-2" data-op="lesson-hw">
            <label className={LBL}>
              Домашнее задание
              <textarea value={form.homework} onChange={(e) => set("homework", e.target.value)} rows={2} className="mt-0.5 w-full rounded-lg bg-white px-2 py-1.5 text-[0.78rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none" />
            </label>
            <label className={LBL}>
              Комментарий
              <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} className="mt-0.5 w-full rounded-lg bg-white px-2 py-1.5 text-[0.78rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none" />
            </label>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="rounded-full bg-[#d8dce3] px-3 py-1 text-sm font-semibold text-[#5c636c]" onClick={closeForm}>
              Отмена
            </button>
            <button
              type="button"
              disabled={saving}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50",
                form.status !== 3 ? "bg-[#d8dce3] text-[#5c636c]" : "bg-primary text-white",
              )}
              onClick={() => void save(false)}
            >
              {saving ? "Сохраняю…" : form.status !== 3 && conduct ? "Сохранить" : "Сохранить в AlfaCRM"}
            </button>
            {form.status !== 3 ? (
              <button
                type="button"
                disabled={saving}
                data-op="lesson-conduct-btn"
                className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void save(true)}
              >
                {saving ? "Провожу…" : "Провести"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}


export function LessonStrip({
  lessons,
  group,
  subject,
  teacher,
  title = "Расписание занятий",
  className,
  branchId,
  groupId,
  customerId,
  people,
  onLessons,
  onOpenPupil,
}: {
  lessons: GroupCalLesson[];
  group?: string;
  subject?: string;
  teacher?: string;
  title?: string;
  className?: string;
  branchId?: number;
  groupId?: number;
  customerId?: number;
  people?: LessonRosterPerson[];
  onLessons?: (next: GroupCalLesson[]) => void;
  onOpenPupil?: (id: number) => void;
}) {
  const today = todayYmd();
  const [range, setRange] = useState<(typeof RANGE_OPTS)[number]["id"]>("10");
  const [tip, setTip] = useState<{ lesson: GroupCalLesson; top: number; left: number } | null>(null);
  const [pin, setPin] = useState<{ lesson: GroupCalLesson; top: number; left: number } | null>(null);
  const [edit, setEdit] = useState<GroupCalLesson | null>(null);
  const [conduct, setConduct] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [legendOpen, setLegendOpen] = useState(false);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const hideRef = useRef<number>(0);
  const all = useMemo(() => [...lessons].sort((a, b) => a.date.localeCompare(b.date)), [lessons]);
  const { past, future, todayHit } = useMemo(() => {
    let pool = all;
    if (range !== "10") {
      const days = Number(range);
      const from = shiftYmd(today, -days);
      const to = shiftYmd(today, days);
      pool = all.filter((l) => (l.date >= from && l.date <= to) || isOneOffLesson(l));
    }
    const pastAll = pool.filter((l) => l.date < today);
    const futureAll = pool.filter((l) => l.date > today);
    let todayHit = pool.find((l) => l.date === today) || null;
    if (range === "10") {
      const past = pastAll.slice(-10);
      const future = futureAll.slice(0, 10);
      const pin = (into: GroupCalLesson[], l: GroupCalLesson) => {
        if (!into.some((x) => (x.lessonId && x.lessonId === l.lessonId) || `${x.date}|${x.from}` === `${l.date}|${l.from}`)) into.push(l);
      };
      for (const l of all.filter(isOneOffLesson)) {
        if (l.date === today) todayHit = todayHit || l;
        else if (l.date < today) pin(past, l);
        else pin(future, l);
      }
      past.sort((a, b) => a.date.localeCompare(b.date) || String(a.from || "").localeCompare(String(b.from || "")));
      future.sort((a, b) => a.date.localeCompare(b.date) || String(a.from || "").localeCompare(String(b.from || "")));
      return { past, future, todayHit };
    }
    return { past: pastAll, future: futureAll, todayHit };
  }, [all, range, today]);
  const shown = past.length + future.length + (todayHit ? 1 : 0);

  function place(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const width = 384;
    let left = r.right + 8;
    if (left + width > window.innerWidth - 8) left = Math.max(8, r.left - width - 8);
    if (left < 8) left = 8;
    let top = r.top;
    if (top + 420 > window.innerHeight) top = Math.max(8, window.innerHeight - 428);
    return { top, left };
  }

  function showTip(el: HTMLElement, lesson: GroupCalLesson) {
    if (pinRef.current) return;
    window.clearTimeout(hideRef.current);
    setTip({ lesson, ...place(el) });
  }

  function hideTipSoon() {
    if (pinRef.current) return;
    window.clearTimeout(hideRef.current);
    hideRef.current = window.setTimeout(() => setTip(null), 180);
  }

  function keepTip() {
    window.clearTimeout(hideRef.current);
  }

  function clickTile(el: HTMLElement, lesson: GroupCalLesson) {
    setError("");
    window.clearTimeout(hideRef.current);
    setTip(null);
    setPin({ lesson, ...place(el) });
  }

  function patchLesson(id: number, patch: Partial<GroupCalLesson>) {
    const next = lessons.map((l) => (l.lessonId === id ? { ...l, ...patch } : l));
    onLessons?.(next);
    setPin((p) => (p && p.lesson.lessonId === id ? { ...p, lesson: { ...p.lesson, ...patch } } : p));
    setTip((p) => (p && p.lesson.lessonId === id ? { ...p, lesson: { ...p.lesson, ...patch } } : p));
  }

  async function setStatus(status: number) {
    const id = (pin || tip)?.lesson.lessonId;
    if (!id || !branchId) return;
    setBusy(true);
    setError("");
    const res = await adminSchedule({ data: { token: token(), action: "lessonStatus", branchId, lessonId: id, statusId: status } as never });
    setBusy(false);
    if (!res.ok) {
      setError(("error" in res && res.error) || "AlfaCRM не сменила статус.");
      return;
    }
    patchLesson(id, { status });
  }

  useEffect(() => {
    if (!pin) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-op='lesson-tile']") || t.closest("[data-op='lesson-pop']") || t.closest("[data-op='lesson-edit']")) return;
      setPin(null);
      setError("");
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [pin]);

  const pop = pin || tip;

  return (
    <div className={cn("min-w-0", className)} data-op="lesson-strip">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted">{title}</p>
        <div className="flex items-center gap-2">
          <p className="text-[0.7rem] text-muted">
            {shown} из {all.length}
          </p>
          <select value={range} onChange={(e) => setRange(e.target.value as (typeof RANGE_OPTS)[number]["id"])} className="h-8 rounded-lg bg-white px-2 text-[0.72rem] font-medium text-fg ring-1 ring-black/8">
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
          <LessonTile key={`${l.date}-${l.lessonId || l.from}`} lesson={l} today={today} customerId={customerId} onEnter={showTip} onLeave={hideTipSoon} onClick={clickTile} />
        ))}
        {todayHit ? (
          <LessonTile key={`${todayHit.date}-${todayHit.lessonId || todayHit.from}`} lesson={todayHit} today={today} customerId={customerId} onEnter={showTip} onLeave={hideTipSoon} onClick={clickTile} />
        ) : (
          <div className="ra-today-tile flex h-[3.35rem] w-[2.76rem] min-w-[2.76rem] flex-col items-center justify-center rounded-lg px-0.5 text-center text-white" title="Сегодня">
            <span className="text-[0.83rem] font-semibold tabular-nums">{Number(today.slice(8))}</span>
            <span className="text-[0.48rem] font-semibold uppercase leading-none tracking-wide text-white/95">сегодня</span>
            <span className="text-[0.6rem] font-medium text-white/90">{MONTHS_SHORT[Number(today.slice(5, 7)) - 1]}</span>
          </div>
        )}
        {future.map((l) => (
          <LessonTile key={`${l.date}-${l.lessonId || l.from}`} lesson={l} today={today} customerId={customerId} onEnter={showTip} onLeave={hideTipSoon} onClick={clickTile} />
        ))}
      </div>
      <div className="mt-2" data-op="lesson-legend">
        <button
          type="button"
          className="text-[0.68rem] text-primary underline-offset-2 hover:underline"
          onClick={() => setLegendOpen((v) => !v)}
        >
          {legendOpen ? "Скрыть легенду" : "Показать легенду"}
        </button>
        {legendOpen ? (
          <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-3" data-op="lesson-legend-list">
            {TILE_LEGEND.map((row) => (
              <span key={row.tone} className="inline-flex items-center gap-1.5 text-[0.68rem] text-muted">
                <span className={cn("relative grid h-7 w-9 shrink-0 place-items-center rounded-[4px] text-[0.58rem] font-semibold", TILE_TONE[row.tone])}>
                  <TileMark mark={row.mark} danger={row.danger} />
                  <span className={cn(row.mark && "mt-1")}>01.01</span>
                </span>
                {row.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {pop && !edit
        ? createPortal(
            <div data-op="lesson-pop">
              <LessonCard
                lesson={pop.lesson}
                top={pop.top}
                left={pop.left}
                group={group}
                subject={subject}
                teacher={teacher}
                people={people}
                pinned={Boolean(pin)}
                busy={busy}
                error={error}
                onClose={() => {
                  setPin(null);
                  setError("");
                }}
                onOpen={branchId ? () => { setConduct(false); setEdit(pop.lesson); setPin(null); setTip(null); } : undefined}
                onOpenPupil={onOpenPupil}
                onConduct={branchId ? () => { setConduct(true); setEdit(pop.lesson); setPin(null); setTip(null); } : undefined}
                onCancel={() => void setStatus(2)}
                onReturn={() => void setStatus(1)}
                onEnter={keepTip}
                onLeave={hideTipSoon}
              />
            </div>,
            document.body,
          )
        : null}
      {edit && branchId ? (
        <div data-op="lesson-edit">
          <LessonEdit
            branchId={branchId}
            groupId={Number(edit.groupIds?.[0] || groupId || 0)}
            seed={edit}
            conduct={conduct}
            onClose={() => { setEdit(null); setConduct(false); }}
            onSaved={(patch) => {
              const id = Number(patch.lessonId || edit.lessonId || 0);
              if (id) patchLesson(id, patch);
              setEdit(null);
              setConduct(false);
              setPin(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export { LessonStrip as GroupLessonStrip };

