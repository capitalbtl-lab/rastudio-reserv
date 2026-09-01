"use client";

import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { createPortal } from "react-dom";
import { adminSchedule, type GroupMember, type CustomerCard } from "@/data/admin-schedule";
import { type CrmSlot } from "@/data/crm-slots-core";
import { Button } from "@/components/ui/button";
import { InfoTip, TipWrap, TIP_BOX } from "@/components/info-tip";
import { AdminSectionHead } from "@/components/admin-self-test";
import { SCHOOLS, BRANCHES } from "@/data/site";
import { SCHOOL_ORDER } from "@/data/crm-slots-core";
import { splitCourseAge } from "@/data/prices-core";
import { slotMismatch, mismatchHint } from "@/data/slot-mismatch";
import { cn } from "@/lib/utils";
import { speakAgent } from "@/data/agent-voice";
import { missingScheduleFields, parseDraftFromSpeech, beatsOf, type LessonBeat } from "@/data/crm-slots";
import { AdminSubjects } from "@/components/admin-subjects";
import { AdminScheduleMap } from "@/components/admin-schedule-map";
import type { CrmSubject } from "@/data/crm-subjects";
import { ADMIN_PANEL_BLUE } from "@/data/admin-ui";
import type { GroupCalLesson } from "@/data/crm-slots-core";

const GROUP_STATUS = [
  { id: 1, name: "Идет набор (ожидает старта)" },
  { id: 2, name: "Обучается (идет набор)" },
  { id: 3, name: "Завершена" },
  { id: 4, name: "Приостановлена" },
];

const SEED_LEVELS = [
  { id: 7, name: "1 класс" },
  { id: 8, name: "2 класс" },
  { id: 9, name: "3 класс" },
  { id: 10, name: "4 класс" },
  { id: 11, name: "5 класс" },
  { id: 15, name: "Ознакомительный" },
  { id: 12, name: "Начальный" },
  { id: 13, name: "Средний" },
  { id: 14, name: "Продвинутый" },
];

const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function shiftYmd(iso: string, days: number) {
  const d = parseYmd(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const RANGE_OPTS = [
  { id: "10", label: "±10 занятий" },
  { id: "7", label: "±7 дней" },
  { id: "30", label: "±30 дней" },
  { id: "90", label: "±90 дней" },
  { id: "180", label: "±180 дней" },
  { id: "360", label: "±360 дней" },
] as const;

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
      className={cn(
        "flex h-[4.025rem] w-[2.82rem] min-w-[2.82rem] cursor-default flex-col items-center justify-center rounded-[0.9rem] px-0.5 text-center leading-tight shadow-[0_1px_3px_rgba(15,23,42,0.12)]",
        isToday && !cancelled && "ra-today-tile text-white",
        !isToday && done && "bg-emerald-100 text-fg ring-1 ring-emerald-400/80",
        !isToday && planned && "bg-white text-fg ring-1 ring-neutral-500/55",
        cancelled && "bg-neutral-200 text-neutral-400 ring-1 ring-neutral-300 line-through",
      )}
    >
      {isToday && !cancelled ? (
        <span className="text-[0.48rem] font-semibold uppercase leading-none tracking-wide text-white/90">сегодня</span>
      ) : (
        <span className={cn("text-[0.6rem] font-semibold uppercase tracking-wider", cancelled ? "text-neutral-400" : "text-neutral-500")}>{WD[(d.getDay() + 6) % 7]}</span>
      )}
      <span className={cn("text-[0.83rem] font-semibold tabular-nums", isToday && !cancelled && "text-white")}>{d.getDate()}</span>
      <span className={cn("text-[0.6rem] font-medium", isToday && !cancelled ? "text-white/85" : "text-neutral-500")}>{MONTHS_SHORT[d.getMonth()]}</span>
    </div>
  );
}

function GroupLessonStrip({ lessons, group, subject, teacher }: { lessons: GroupCalLesson[]; group?: string; subject?: string; teacher?: string }) {
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
    <div className="md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted">Расписание занятий</p>
        <div className="flex items-center gap-2">
          <p className="text-[0.7rem] text-muted">{shown} из {all.length}</p>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as (typeof RANGE_OPTS)[number]["id"])}
            className="h-8 rounded-[4px] bg-white px-2 text-[0.72rem] font-medium text-fg ring-1 ring-black/8"
          >
            {RANGE_OPTS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {past.map((l) => (
          <LessonTile key={l.date} lesson={l} today={today} onEnter={showTip} onLeave={() => setTip(null)} />
        ))}
        {todayHit ? (
          <LessonTile key={todayHit.date} lesson={todayHit} today={today} onEnter={showTip} onLeave={() => setTip(null)} />
        ) : (
          <div
            className="ra-today-tile flex h-[4.025rem] w-[2.82rem] min-w-[2.82rem] flex-col items-center justify-center rounded-[0.9rem] px-0.5 text-center text-white"
            title="Сегодня"
          >
            <span className="text-[0.48rem] font-semibold uppercase leading-none tracking-wide text-white/95">сегодня</span>
            <span className="text-[0.83rem] font-semibold tabular-nums">{Number(today.slice(8))}</span>
            <span className="text-[0.6rem] font-medium text-white/90">{MONTHS_SHORT[Number(today.slice(5, 7)) - 1]}</span>
          </div>
        )}
        {future.map((l) => (
          <LessonTile key={l.date} lesson={l} today={today} onEnter={showTip} onLeave={() => setTip(null)} />
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-[0.68rem] text-muted">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-100 ring-1 ring-emerald-400/80" /> проведено</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-white ring-1 ring-neutral-400" /> запланировано</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-neutral-200 ring-1 ring-neutral-300" /> отменено</span>
      </p>
      {tip
        ? createPortal(
            <LessonCard
              lesson={tip.lesson}
              top={tip.top}
              left={tip.left}
              group={group}
              subject={subject}
              teacher={teacher}
            />,
            document.body,
          )
        : null}
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
      className="pointer-events-none fixed z-[90] w-[16rem] rounded-md bg-white px-3 py-2 text-left text-[0.68rem] leading-snug text-fg shadow-[0_8px_22px_rgba(15,23,42,0.22)] ring-1 ring-black/10"
      style={{ top, left }}
    >
      <p className="mb-1 text-[0.62rem] font-semibold tracking-wide text-muted">{dateLabel}</p>
      <dl className="space-y-0.5">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[5.2rem_1fr] gap-x-2">
            <dt className="text-[0.62rem] text-muted">{k}</dt>
            <dd className={cn("font-medium", k === "Тема" || k === "Домашнее задание" ? "whitespace-pre-wrap" : "")}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "ещё не загружали";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function download(name: string, mime: string, text: string) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

type Ver = { at: string; reason: string; count: number };
type Change = { id: string; field: string; from: string; to: string };
type Draft = {
  school: string;
  course: string;
  age: string;
  day: number;
  timeFrom: string;
  timeTo: string;
  branch: string;
  teacher: string;
};

const EMPTY_DRAFT: Draft = { school: "", course: "", age: "", day: 2, timeFrom: "18:00", timeTo: "19:30", branch: "", teacher: "" };
const EMPTY_WIZARD: Draft = { school: "", course: "", age: "", day: 0, timeFrom: "", timeTo: "", branch: "", teacher: "" };

const BRANCH_OPTS = [
  "Коломна, ул. Гражданская, 2",
  "Коломна, ЦМИТ, ул. Октябрьской революции, 340",
  "Луховицы, ул. Пушкина, 202А",
];

function speechCtor() {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

function voiceNorm(s: string) {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-я0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function leftoverAfterReject(s: string) {
  return s
    .replace(/\bнет\b[,.]?/gi, " ")
    .replace(/\bне[- ]?а\b/gi, " ")
    .replace(/\bне надо\b[,.]?/gi, " ")
    .replace(/\bдавай по[- ]?другому( сделаем)?\b/gi, " ")
    .replace(/\bпо[- ]?другому( сделаем)?\b/gi, " ")
    .replace(/\bне так\b/gi, " ")
    .replace(/\bне публик\w*\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function leftoverLooksLikeEdit(s: string) {
  const w = voiceNorm(s);
  if (w.length < 3) return false;
  return /лимит|мест|групп|дет|человек|возраст|день|время|педагог|филиал|курс|поставь|поменяй|измени|сделай|максимум|минимум|\d/.test(w);
}

function isPreviewReject(s: string) {
  const w = voiceNorm(s);
  if (!w) return false;
  if (/не\s+(надо|стоит|публик|примен|сохраня)|не надо|по[- ]?другому|не так|\bотмен/.test(w)) return true;
  if (/^(нет|не|неа)$/.test(w)) return true;
  if (/^нет\b/.test(w) && !leftoverLooksLikeEdit(leftoverAfterReject(s))) return true;
  return false;
}

function isPreviewConfirm(s: string) {
  const w = voiceNorm(s);
  if (!w || isPreviewReject(s)) return false;
  if (/опублик|примен|\bпринять\b|публик|сохраняй|сохрани|подтверд/.test(w) && !/не\s+(опублик|примен|публик|сохраня)/.test(w)) return true;
  return /^(да|ага|угу|ок|окей|хорошо|ладно|давай|делай|делаем|конечно|верно|так|согласен|согласна|я согласен|я согласна|да давай|да делай|да хорошо|да публикуй|да опубликуй|так и сделай|вперед|можно|да можно)$/.test(w);
}

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function leadHref(s: CrmSlot) {
  if (s.signup?.startsWith("http")) return s.signup;
  if (s.groupId) return `https://studiyarazvivaysya.s20.online/common/${s.branchId || 1}/lead/create?gid=${s.groupId}`;
  return "";
}

function inCrm(s: CrmSlot) {
  return Number(s.groupId) > 0 && !String(s.id).startsWith("local-");
}

function DetailsBtn({ on, onClick }: { on?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={on ? "Свернуть" : "Подробно"}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-medium leading-none transition-colors",
        on ? "bg-[#b8c0cc] text-fg" : "bg-[#c5ccd6] text-[#3f4854] hover:bg-[#b4bcc8]",
      )}
    >
      {on ? "−" : "+"}
    </button>
  );
}

type GroupDetail = {
  id: string;
  groupId: number;
  branchId: number;
  description: string;
  remarks: string;
  hashtags: string;
  makeup: string;
  statusId: number;
  bDate: string;
  eDate: string;
  levelId: number;
  signup: string;
  subjectId: number;
  calendar: GroupCalLesson[];
  members: GroupMember[];
  archive: GroupMember[];
  membersLoading: boolean;
  loading: boolean;
  saving: boolean;
  slot: CrmSlot;
};

function GroupNameField({ value, onChange, subject }: { value: string; onChange: (v: string) => void; subject?: string }) {
  const src = useRef<HTMLInputElement>(null);
  const hideT = useRef(0);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, height: 32, width: 160 });

  function show() {
    window.clearTimeout(hideT.current);
    setOpen(true);
  }
  function hide() {
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => setOpen(false), 150);
  }

  function place() {
    const el = src.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;left:-9999px;white-space:nowrap;font-size:0.8rem;padding:0 8px";
    probe.textContent = value || el.placeholder || "";
    document.body.appendChild(probe);
    const need = probe.offsetWidth + 20;
    probe.remove();
    const max = window.innerWidth - r.left - 12;
    const width = Math.min(max, Math.max(r.width, need, r.width + 92));
    setPos({ top: r.top, left: r.left, height: r.height, width });
  }

  useEffect(() => {
    if (open) {
      setShown(true);
      place();
      const fade = window.setTimeout(() => setOpen(false), 5000);
      function onScroll() {
        place();
      }
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
      return () => {
        window.clearTimeout(fade);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onScroll);
      };
    }
    const hide = window.setTimeout(() => setShown(false), 320);
    return () => window.clearTimeout(hide);
  }, [open, value]);

  return (
    <>
      <input
        ref={src}
        value={value}
        title={subject ? `${value} · предмет: ${subject}` : value}
        onChange={(e) => onChange(e.target.value)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="h-8 w-full rounded-md bg-surface-2 px-2 text-[0.8rem] ring-1 ring-black/8"
      />
      {shown
        ? createPortal(
            <input
              value={value}
              autoFocus={false}
              onChange={(e) => onChange(e.target.value)}
              onMouseEnter={show}
              onMouseLeave={hide}
              onBlur={hide}
              style={{ top: pos.top, left: pos.left, height: pos.height, width: pos.width, opacity: open ? 1 : 0 }}
              className="fixed z-[75] rounded-md bg-white px-2 text-[0.8rem] shadow-[0_8px_28px_rgba(15,23,42,0.22)] ring-1 ring-black/20 transition-opacity duration-300"
            />,
            document.body,
          )
        : null}
    </>
  );
}

function MismatchDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const left = Math.min(window.innerWidth - 280, Math.max(8, r.left));
      const top = r.bottom + 8;
      const flip = top + 140 > window.innerHeight;
      setPos({ top: flip ? r.top - 8 : top, left });
    }
    setOpen(true);
  }
  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center"
        aria-label="Ошибка CRM"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400/70" />
        <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[0.62rem] font-bold leading-none text-white">i</span>
      </button>
      {open
        ? createPortal(
            <div
              className={cn("pointer-events-none fixed z-[80] w-[17rem] whitespace-pre-line", TIP_BOX)}
              style={{ top: pos.top, left: pos.left }}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CrmDot({ s }: { s: CrmSlot }) {
  const ok = inCrm(s);
  return (
    <span
      title={ok ? "Группа есть в AlfaCRM" : "Только на сайте, в AlfaCRM ещё не выгружена"}
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", ok ? "bg-emerald-500" : "bg-pink-400")}
    />
  );
}

function WeekDots({
  s,
  index,
  onView,
  onAdd,
}: {
  s: CrmSlot;
  index: number;
  onView: (i: number) => void;
  onAdd: (b: LessonBeat) => void;
}) {
  const beats = beatsOf(s);
  const i = ((index % beats.length) + beats.length) % beats.length;
  const plus = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const first = beats[0];
  const [day, setDay] = useState(first.day === 2 ? 4 : 2);
  const [from, setFrom] = useState(first.timeFrom || "18:00");
  const [to, setTo] = useState(first.timeTo || "19:30");

  function place() {
    const el = plus.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 240;
    const h = 210;
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 12) top = Math.max(8, r.top - h - 8);
    let left = r.right - w;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    setPos({ top, left });
  }

  useEffect(() => {
    if (!open) return;
    place();
    function close(e: MouseEvent) {
      const t = e.target as Node;
      if (plus.current?.contains(t) || box.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        title={beats.length > 1 ? `Занятие ${i + 1} из ${beats.length}. Нажмите, чтобы показать другой день.` : "Одно занятие в неделю"}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[0.75rem] font-semibold ring-1 ring-black/8"
        onClick={() => {
          if (beats.length > 1) onView((i + 1) % beats.length);
        }}
      >
        {i + 1}
      </button>
      {beats.length < 3 ? (
        <button
          ref={plus}
          type="button"
          title="Добавить занятие в другой день"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg leading-none ring-1 ring-black/20"
          onClick={() => {
            setOpen((v) => !v);
            place();
          }}
        >
          +
        </button>
      ) : null}
      {open
        ? createPortal(
            <div
              ref={box}
              className="fixed z-[90] w-[15rem] rounded-2xl bg-white p-3.5 text-fg shadow-[0_12px_40px_rgba(15,23,42,0.28)] ring-1 ring-black/20"
              style={{ top: pos.top, left: pos.left }}
            >
              <p className="text-sm font-semibold">Второе занятие</p>
              <p className="mt-0.5 text-[0.7rem] text-muted">День и время в ту же группу. Длительность как у первого.</p>
              <label className="mt-2.5 block text-[0.7rem] font-medium text-fg">
                День
                <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="mt-1 h-9 w-full rounded-full bg-[#f3f5f8] px-3 text-sm ring-1 ring-black/15">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>{["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][d]}</option>
                  ))}
                </select>
              </label>
              <div className="mt-2 flex gap-2">
                <label className="flex-1 text-[0.7rem] font-medium">
                  С
                  <input value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-full rounded-full bg-[#f3f5f8] px-2 text-center text-sm ring-1 ring-black/15" />
                </label>
                <label className="flex-1 text-[0.7rem] font-medium">
                  До
                  <input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-full rounded-full bg-[#f3f5f8] px-2 text-center text-sm ring-1 ring-black/15" />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-end gap-3">
                <button type="button" className="text-xs font-semibold text-muted" onClick={() => setOpen(false)}>Отмена</button>
                <button
                  type="button"
                  className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white"
                  onClick={() => {
                    onAdd({ day, timeFrom: from, timeTo: to, lessonId: 0 });
                    setOpen(false);
                  }}
                >
                  Применить
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function CheckBox({
  ids,
  picked,
  onToggle,
}: {
  ids: string[];
  picked: Record<string, boolean>;
  onToggle: (ids: string[], on: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const all = ids.length > 0 && ids.every((id) => picked[id]);
  const some = ids.some((id) => picked[id]);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some && !all;
  }, [some, all]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={all}
      className="h-4 w-4 shrink-0 accent-primary"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onToggle(ids, e.target.checked);
      }}
    />
  );
}

function WhoTip({ names, onNeed }: { names?: string[]; onNeed: () => void }) {
  const btn = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function place() {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 240;
    const h = Math.min(280, 28 + Math.max(1, names?.length || 1) * 20);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    setPos({ top, left });
  }

  useEffect(() => {
    if (open) place();
  }, [open, names]);

  function show() {
    onNeed();
    place();
    setOpen(true);
  }

  const label = names ? (names.length ? `${names.length} уч.` : "пусто") : "Кто учится";

  return (
    <>
      <span
        ref={btn}
        tabIndex={0}
        className="inline-flex h-8 w-full min-w-[5.6rem] cursor-default items-center justify-center rounded-full bg-surface-2 px-2 text-center text-[0.72rem] text-muted ring-1 ring-black/8"
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        {label}
      </span>
      {open
        ? createPortal(
            <div
              className={cn("pointer-events-none fixed z-[80] w-[15rem]", TIP_BOX)}
              style={{ top: pos.top, left: pos.left }}
            >
              {!names ? "Загружаю…" : names.length ? names.map((n) => <p key={n}>{n}</p>) : "В группе пока никого"}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MemberGrid({ title, items, onOpen, archive }: { title: string; items: GroupMember[]; onOpen: (m: GroupMember) => void; archive?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted">{title} · {items.length}</p>
      <ul className="mt-1.5 divide-y divide-black/6 overflow-hidden rounded-2xl bg-white ring-1 ring-black/6">
        {items.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onOpen(m)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-primary/5">
              <span>
                <span className="block font-medium">{m.name || "Без имени"}</span>
                <span className="block text-[0.75rem] text-muted">
                  {[m.age, m.parent, m.from && `с ${m.from}`, m.to && `по ${m.to}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", archive ? "bg-surface-2 text-muted" : "bg-primary/10 text-primary")}>
                {archive ? "архив" : m.status || "учится"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminSchedule() {
  const [slots, setSlots] = useState<CrmSlot[]>([]);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openSchool, setOpenSchool] = useState("");
  const [openCourse, setOpenCourse] = useState("");
  const [openAll, setOpenAll] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [versions, setVersions] = useState<Ver[]>([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiChanges, setAiChanges] = useState<Change[]>([]);
  const [aiComment, setAiComment] = useState("");
  const [aiAdds, setAiAdds] = useState<Draft[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [who, setWho] = useState<Record<string, string[]>>({});
  const whoRef = useRef<Record<string, string[]>>({});
  const whoPending = useRef<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [listen, setListen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [interim, setInterim] = useState("");
  const [wizard, setWizard] = useState<Draft>(EMPTY_WIZARD);
  const [ask, setAsk] = useState("");
  const recRef = useRef<Rec | null>(null);
  const voiceModeRef = useRef(false);
  const dictationRef = useRef(false);
  const pauseRef = useRef(false);
  const speakingRef = useRef(false);
  const busyVoiceRef = useRef(false);
  const awaitingRevisionRef = useRef(false);
  const lastSaidRef = useRef("");
  const ignoreUntilRef = useRef(0);
  const listenBaseRef = useRef("");
  const speechTimer = useRef(0);
  const lastFinalRef = useRef("");
  const doneRef = useRef(0);
  const accRef = useRef("");
  const promptRef = useRef("");
  const addsRef = useRef<Draft[]>([]);
  const changesRef = useRef<Change[]>([]);
  const pickedRef = useRef<string[]>([]);
  const slotsRef = useRef<CrmSlot[]>([]);
  const wizardRef = useRef<Draft>(EMPTY_WIZARD);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [view, setView] = useState<Record<string, number>>({});
  const [fileOpen, setFileOpen] = useState(false);
  const [pull, setPull] = useState({ open: false, step: "", done: false, added: 0, updated: 0, total: 0, error: "" });
  const [pane, setPane] = useState<"groups" | "subjects" | "map">("groups");
  const [branchFilter, setBranchFilter] = useState("all");
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [pushUi, setPushUi] = useState({ open: false, step: "", done: false, created: 0, pushed: 0, failed: 0, error: "", lines: [] as string[] });
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [pupil, setPupil] = useState<CustomerCard | null>(null);
  const [pupilLoading, setPupilLoading] = useState(false);
  const [subjects, setSubjects] = useState<CrmSubject[]>([]);
  const [levels, setLevels] = useState<{ id: number; name: string }[]>(SEED_LEVELS);
  const fileRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const versionsRef = useRef<HTMLDivElement>(null);
  const versionsMenuRef = useRef<HTMLDivElement>(null);
  const promptEl = useRef<HTMLTextAreaElement>(null);

  function take(res: { ok: boolean; slots?: CrmSlot[]; at?: string; versions?: Ver[]; error?: string; comment?: string; changes?: Change[]; adds?: Draft[]; pushed?: number; created?: string[]; applied?: string[] }) {
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return;
    }
    if (res.slots) setSlots(res.slots);
    if (res.at) setAt(res.at);
    if (res.versions) setVersions(res.versions);
    if (res.comment) setAiComment(res.comment);
    if (res.changes) setAiChanges(res.changes);
    if (res.adds) setAiAdds(res.adds);
    if (res.created?.length || res.applied?.length) {
      const ids = [...new Set([...(res.created || []), ...(res.applied || [])])];
      setDirty((d) => {
        const n = new Set(d);
        for (const id of ids) n.add(id);
        return n;
      });
      setOpenAll(true);
      setFlash(new Set(ids));
      const first = (res.slots || []).find((s) => ids.includes(s.id));
      if (first) {
        setOpenSchool(first.school);
        setOpenCourse(first.course);
        window.setTimeout(() => {
          document.getElementById(`ra-slot-${ids[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
      }
      window.setTimeout(() => setFlash(new Set()), 2600);
      setAiAdds([]);
      setAiChanges([]);
      setAiComment("");
    }
  }

  async function run(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    const res = await adminSchedule({ data: { token: token(), action, ...extra } as never });
    take(res as never);
    setBusy(false);
    return res;
  }

  useEffect(() => {
    void run("get");
    const id = window.setInterval(() => {
      void adminSchedule({ data: { token: token(), action: "pull" } }).then((res) => {
        if (res.ok) {
          take(res as never);
          setMsg("Расписание само обновилось из AlfaCRM.");
        }
      });
    }, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    promptRef.current = aiPrompt;
  }, [aiPrompt]);
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);
  useEffect(() => {
    addsRef.current = aiAdds;
  }, [aiAdds]);
  useEffect(() => {
    changesRef.current = aiChanges;
  }, [aiChanges]);
  useEffect(() => {
    pickedRef.current = Object.keys(picked).filter((id) => picked[id]);
  }, [picked]);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  useEffect(() => {
    const el = promptEl.current;
    if (!el) return;
    el.style.height = "40px";
    el.style.height = `${Math.min(160, Math.max(40, el.scrollHeight))}px`;
    el.style.overflowY = el.scrollHeight > 160 ? "auto" : "hidden";
  }, [aiPrompt, interim]);
  useEffect(() => {
    function close(e: MouseEvent) {
      const t = e.target as Node;
      if (fileRef.current?.contains(t) || fileMenuRef.current?.contains(t)) return;
      setFileOpen(false);
      if (versionsRef.current?.contains(t) || versionsMenuRef.current?.contains(t)) return;
      setVersionsOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    if (!detail) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (pupil) setPupil(null);
      else {
        setDetail(null);
        setPupil(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, pupil]);

  function patch(id: string, field: keyof CrmSlot, value: string | number) {
    setSlots((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, [field]: value };
        if (field === "day") next.dayLabel = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][Number(value)] || s.dayLabel;
        return next;
      }),
    );
    setDirty((d) => new Set(d).add(id));
  }

  async function openDetail(s: CrmSlot) {
    if (detail?.id === s.id) {
      setDetail(null);
      setPupil(null);
      return;
    }
    setPupil(null);
    setDetail({
      id: s.id,
      groupId: s.groupId,
      branchId: s.branchId,
      description: s.description || s.groupNote || "",
      remarks: s.remarks || "",
      hashtags: (s.hashtags || "").replace(/\s+/g, " ").trim(),
      makeup: s.makeup || "",
      statusId: s.statusId || 0,
      bDate: s.bDate || "",
      eDate: s.eDate || "",
      levelId: s.levelId || 0,
      signup: leadHref(s),
      subjectId: s.subjectId || 0,
      calendar: [],
      members: [],
      archive: [],
      membersLoading: Boolean(s.groupId),
      loading: Boolean(s.groupId),
      saving: false,
      slot: s,
    });
    if (!s.groupId) {
      const sub = await adminSchedule({ data: { token: token(), action: "subjectsGet" } as never });
      if (sub.ok && "subjects" in sub && Array.isArray(sub.subjects)) setSubjects(sub.subjects as CrmSubject[]);
      setDetail((d) => (d && d.id === s.id ? { ...d, loading: false, membersLoading: false } : d));
      return;
    }
    const [res, people] = await Promise.all([
      adminSchedule({ data: { token: token(), action: "groupGet", groupId: s.groupId, branchId: s.branchId } as never }),
      adminSchedule({ data: { token: token(), action: "groupMembers", groupId: s.groupId, branchId: s.branchId } as never }),
    ]);
    applyGroupRes(s.id, s, res);
    if (people.ok && "active" in people) {
      const active = (people.active || []) as GroupMember[];
      const archive = (people.archive || []) as GroupMember[];
      setDetail((d) => (d && d.id === s.id ? { ...d, members: active, archive, membersLoading: false } : d));
      const key = `${s.branchId}-${s.groupId}`;
      const names = active.map((m) => m.name);
      whoRef.current = { ...whoRef.current, [key]: names };
      setWho((w) => ({ ...w, [key]: names }));
    } else {
      setDetail((d) => (d && d.id === s.id ? { ...d, membersLoading: false } : d));
    }
    if (res.ok && "fromCache" in res && res.fromCache) {
      const fresh = await adminSchedule({ data: { token: token(), action: "groupGet", groupId: s.groupId, branchId: s.branchId, fresh: true } as never });
      applyGroupRes(s.id, s, fresh);
    }
  }

  async function openPupil(m: GroupMember) {
    if (!detail) return;
    setPupilLoading(true);
    setPupil({
      id: m.id,
      branchId: detail.branchId,
      name: m.name,
      parent: m.parent,
      dob: m.dob,
      age: m.age,
      gender: m.gender,
      phones: m.phones,
      emails: m.email ? [m.email] : [],
      address: "",
      status: m.status,
      note: "",
      paidTill: m.to,
      url: `https://studiyarazvivaysya.s20.online/company/${detail.branchId}/customer/view?id=${m.id}`,
      comms: [],
    });
    const res = await adminSchedule({ data: { token: token(), action: "customerGet", customerId: m.id, branchId: detail.branchId } as never });
    setPupilLoading(false);
    if (res.ok && "customer" in res && res.customer) setPupil(res.customer as CustomerCard);
  }

  function applyGroupRes(id: string, s: CrmSlot, res: Awaited<ReturnType<typeof adminSchedule>>) {
    if (!res.ok || !("group" in res) || !res.group) {
      setDetail((d) => (d && d.id === id ? { ...d, loading: false } : d));
      if (!res.ok) setMsg(res.error || "Не удалось открыть группу в AlfaCRM.");
      return;
    }
    if ("subjects" in res && Array.isArray(res.subjects)) setSubjects(res.subjects as CrmSubject[]);
    if ("levels" in res && Array.isArray((res as { levels?: { id: number; name: string }[] }).levels) && (res as { levels: { id: number; name: string }[] }).levels.length) {
      setLevels((res as { levels: { id: number; name: string }[] }).levels);
    }
    const g = res.group as {
      note: string;
      description?: string;
      remarks?: string;
      hashtags: string;
      makeup: string;
      statusId: number;
      signup: string;
      subjectId: number;
      bDate?: string;
      eDate?: string;
      levelId?: number;
      calendar?: GroupCalLesson[];
    };
    setDetail((d) =>
      d && d.id === id
        ? {
            ...d,
            description: g.description || g.note || "",
            remarks: g.remarks || "",
            hashtags: (g.hashtags || "").replace(/\s+/g, " ").trim(),
            makeup: g.makeup,
            statusId: g.statusId,
            bDate: g.bDate || d.bDate,
            eDate: g.eDate || d.eDate,
            levelId: g.levelId || d.levelId,
            signup: g.signup || d.signup,
            subjectId: g.subjectId || d.subjectId,
            calendar: g.calendar?.length ? g.calendar : d.calendar,
            loading: false,
          }
        : d,
    );
  }

  async function saveDetail() {
    if (!detail?.groupId) {
      setMsg("Сначала выгрузите группу в AlfaCRM.");
      return;
    }
    setDetail((d) => (d ? { ...d, saving: true } : d));
    const res = await adminSchedule({
      data: {
        token: token(),
        action: "groupSave",
        groupId: detail.groupId,
        branchId: detail.branchId,
        note: detail.description,
        description: detail.description,
        remarks: detail.remarks,
        hashtags: detail.hashtags,
        makeup: detail.makeup,
        statusId: detail.statusId,
        subjectId: detail.subjectId,
        bDate: detail.bDate,
        eDate: detail.eDate,
        levelId: detail.levelId,
      } as never,
    });
    take(res as never);
    setDetail((d) => (d ? { ...d, saving: false } : d));
    if (res.ok) setMsg("Подробности группы сохранены в AlfaCRM.");
  }

  function shownBeat(s: CrmSlot) {
    const beats = beatsOf(s);
    const i = view[s.id] || 0;
    return beats[((i % beats.length) + beats.length) % beats.length];
  }

  function patchBeat(s: CrmSlot, field: "day" | "timeFrom" | "timeTo", value: string | number) {
    const beats = beatsOf(s);
    const i = view[s.id] || 0;
    const next = beats.map((b, n) => (n === i ? { ...b, [field]: value } : b));
    const cur = next[i];
    setSlots((list) =>
      list.map((row) =>
        row.id === s.id
          ? {
              ...row,
              beats: next,
              timesPerWeek: next.length,
              day: i === 0 ? Number(cur.day) : row.day,
              dayLabel: i === 0 ? ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][Number(cur.day)] || row.dayLabel : row.dayLabel,
              timeFrom: i === 0 ? cur.timeFrom : row.timeFrom,
              timeTo: i === 0 ? cur.timeTo : row.timeTo,
            }
          : row,
      ),
    );
    setDirty((d) => new Set(d).add(s.id));
  }

  function addBeat(s: CrmSlot, b: LessonBeat) {
    const beats = [...beatsOf(s), b];
    setSlots((list) => list.map((row) => (row.id === s.id ? { ...row, beats, timesPerWeek: beats.length } : row)));
    setView((v) => ({ ...v, [s.id]: beats.length - 1 }));
    setDirty((d) => new Set(d).add(s.id));
  }

  const tree = useMemo(() => {
    const map = new Map<string, Map<string, CrmSlot[]>>();
    const names = [...SCHOOLS.map((s) => s.label), "Прочее"];
    for (const name of names) map.set(name, new Map());
    for (const s of slots) {
      if (branchFilter !== "all") {
        const key = s.branchId ? String(s.branchId) : `x-${s.city}|${s.branch}`;
        if (key !== branchFilter) continue;
      }
      const mm = slotMismatch(s);
      if (onlyMismatch && !mm.level) continue;
      const school = names.includes(s.school) ? s.school : "Прочее";
      const course = splitCourseAge(s.course || s.subject || s.groupName || "Без названия").name || "Без названия";
      const bag = map.get(school)!;
      if (!bag.has(course)) bag.set(course, []);
      bag.get(course)!.push(s);
    }
    return names
      .filter((school) => (map.get(school)?.size || 0) > 0)
      .map((school) => ({
        school,
        courses: [...(map.get(school)?.entries() || [])]
          .sort((a, b) => a[0].localeCompare(b[0], "ru"))
          .map(([course, items]) => ({ course, items })),
      }));
  }, [slots, branchFilter, onlyMismatch]);

  useEffect(() => {
    if (!onlyMismatch) return;
    const t = window.setTimeout(() => {
      document.getElementById("ra-mismatch-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
    return () => window.clearTimeout(t);
  }, [onlyMismatch, tree.length]);

  const mismatchCount = useMemo(() => {
    let hard = 0;
    let soft = 0;
    const lines: string[] = [];
    const ids: string[] = [];
    for (const s of slots) {
      const mm = slotMismatch(s);
      if (!mm.level) continue;
      if (mm.level === "hard") hard += 1;
      else soft += 1;
      lines.push(`${s.groupId || "—"} ${s.groupName}: ${mm.text}`);
      ids.push(s.id);
    }
    return { hard, soft, all: hard + soft, lines, ids };
  }, [slots]);

  const branchOpts = useMemo(() => {
    const main = [
      { id: "1", label: "Гражданская, 2" },
      { id: "2", label: "ЦМИТ, Октябрьской, 340" },
      { id: "3", label: "Луховицы, Пушкина, 202А" },
    ];
    const seen = new Set(main.map((m) => m.id));
    const extra: { id: string; label: string }[] = [];
    for (const s of slots) {
      const id = s.branchId ? String(s.branchId) : `x-${s.city}|${s.branch}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const label = [s.city, s.branch].filter(Boolean).join(", ") || `филиал ${id}`;
      extra.push({ id, label });
    }
    extra.sort((a, b) => a.label.localeCompare(b.label, "ru"));
    return [{ id: "all", label: "Все филиалы" }, ...main, ...extra];
  }, [slots]);

  const pickedIds = useMemo(() => Object.keys(picked).filter((id) => picked[id]), [picked]);

  function setIds(ids: string[], on: boolean) {
    setPicked((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = on;
      return next;
    });
  }

  async function loadWho(s: CrmSlot) {
    const key = `${s.branchId}-${s.groupId}`;
    if (!s.groupId || whoRef.current[key] || whoPending.current.has(key)) return;
    whoPending.current.add(key);
    const res = await adminSchedule({ data: { token: token(), action: "students", groupId: s.groupId, branchId: s.branchId } });
    const names = res.ok && "names" in res && Array.isArray(res.names) ? (res.names as string[]) : [];
    whoRef.current = { ...whoRef.current, [key]: names };
    setWho((prev) => ({ ...prev, [key]: names }));
    whoPending.current.delete(key);
  }

  useEffect(() => {
    const items = openAll
      ? tree.flatMap((s) => s.courses.flatMap((c) => c.items))
      : tree.flatMap((s) => s.courses).find((c) => c.course === openCourse)?.items || [];
    for (const s of items) void loadWho(s);
  }, [openCourse, openAll, tree]);

  async function applyPreview() {
    const adds = addsRef.current;
    const changes = changesRef.current;
    if (!changes.length && !adds.length) {
      setMsg("Сначала отправьте запрос стрелкой — откроется предпросмотр.");
      return;
    }
    const res = await run("aiApply", { changes, adds, prompt: promptRef.current });
    if (res.ok) {
      setAiPrompt("");
      promptRef.current = "";
      const applied = (res as { applied?: string[]; created?: string[] }).applied || [];
      const created = (res as { created?: string[] }).created || [];
      const n = applied.length || created.length;
      setMsg(n ? `Опубликовано на сайте: ${n} групп. Раскрыл расписание.` : "Опубликовано.");
    }
  }

  const DAYS_SHORT = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const box = "h-8 w-[4.6rem] shrink-0 rounded-full bg-surface-2 px-1 text-center text-[0.75rem] leading-8 ring-1 ring-black/8";
  const cell = box;
  const FIELD_RU: Record<string, string> = {
    limit: "места",
    groupName: "название",
    age: "возраст",
    day: "день",
    timeFrom: "с",
    timeTo: "до",
    teacher: "педагог",
    branch: "филиал",
    course: "курс",
    school: "школа",
  };

  const coursesOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      if (!map.has(s.school)) map.set(s.school, []);
      if (s.course && !map.get(s.school)!.includes(s.course)) map.get(s.school)!.push(s.course);
    }
    return map;
  }, [slots]);
  const teachers = useMemo(() => [...new Set(slots.map((s) => s.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")), [slots]);

  function parseVoice(text: string) {
    const t = text.trim().replace(/[.!?…,:;]+$/g, "").replace(/\s+/g, " ").trim();
    const hasPreview = Boolean(changesRef.current.length || addsRef.current.length);
    if (hasPreview) {
      if (isPreviewReject(t) && !leftoverLooksLikeEdit(leftoverAfterReject(t))) return { body: "", cmd: "переделать" };
      if (isPreviewConfirm(t)) return { body: "", cmd: "применить" };
    }
    const whole = t.toLowerCase().replace(/ё/g, "е");
    const words = t.split(" ").filter(Boolean);
    const last = (words[words.length - 1] || "").toLowerCase().replace(/ё/g, "е").replace(/[^а-я]/g, "");
    const rest = words.slice(0, -1).join(" ");
    if (words.length <= 6) {
      if (/^(готов[аоыуе]?|гатов[аоыуе]?)$/.test(last)) return { body: rest, cmd: "готово" };
      if (/^(предпросмотр|превью)$/.test(last)) return { body: rest, cmd: "предпросмотр" };
      if (/^(примен\w*|принять|опублик\w*)$/.test(last)) return { body: rest, cmd: "применить" };
      if (/^(отмен\w*)$/.test(last)) return { body: rest, cmd: "отменить" };
      if (/^(дальше|далее|следующ\w*)$/.test(last)) return { body: rest, cmd: "дальше" };
    }
    if (/^(готов[аоыуе]?|гатов[аоыуе]?)$/.test(whole.replace(/[^а-я]/g, ""))) return { body: "", cmd: "готово" };
    return { body: t, cmd: "" };
  }

  function isEcho(heard: string) {
    const a = heard
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^а-я0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!a || a.length < 6) return false;
    if (isPreviewConfirm(heard) || isPreviewReject(heard)) return false;
    if (Date.now() < ignoreUntilRef.current) return true;
    const b = lastSaidRef.current
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^а-я0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (b && (b.includes(a) || a.includes(b.slice(0, 18)))) return true;
    return [
      "привет что будем делать сегодня",
      "хорошо сейчас все поправим",
      "готово скажите опубликовать",
      "нет я не могу это поправить",
      "скажите опубликовать",
      "предпросмотр на экране",
      "лимит мест",
      "что меняем как делаем",
      "скажите да опубликую",
    ].some((c) => a.includes(c) || (a.length > 10 && c.includes(a)));
  }

  function commitSpeech(raw: string) {
    if (isEcho(raw)) return;
    const { body, cmd } = parseVoice(raw);
    lastFinalRef.current = raw;
    setInterim("");
    if (cmd) {
      void runCmd(cmd, body);
      return;
    }
    if (voiceModeRef.current) {
      void handleScheduleVoice(body);
      return;
    }
    if (body) {
      setAiPrompt((p) => {
        const n = p ? `${p} ${body}` : body;
        promptRef.current = n;
        listenBaseRef.current = n;
        return n;
      });
      void absorbSpeech(body);
    }
  }

  async function playScheduleVoice(dataUrl: string, volume: number) {
    let src = dataUrl;
    try {
      const b64 = String(dataUrl).split(",")[1] || "";
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      src = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    } catch {
      /* data url as is */
    }
    const el = new Audio();
    el.src = src;
    el.volume = Math.min(1, Math.max(0.4, volume || 1));
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.onended = null;
        el.onerror = null;
        try {
          el.pause();
        } catch {
          /* */
        }
        if (src.startsWith("blob:")) URL.revokeObjectURL(src);
        resolve();
      };
      el.onended = () => finish();
      el.onerror = () => finish();
      el.onloadedmetadata = () => {
        const ms = Math.max(1200, (Number.isFinite(el.duration) ? el.duration : 6) * 1000 + 600);
        window.setTimeout(finish, ms);
      };
      el.play().catch(() => finish());
    });
  }

  async function say(text: string) {
    lastSaidRef.current = text;
    setAsk(text);
    setMsg(text);
    speakingRef.current = true;
    pauseRef.current = true;
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    try {
      const res = await speakAgent({ data: { text, who: "olga" } });
      if (res.ok && "audio" in res && res.audio) {
        await playScheduleVoice(String(res.audio), "volume" in res ? Number(res.volume) || 1 : 1);
      }
    } catch {
      /* */
    }
    speakingRef.current = false;
    pauseRef.current = false;
    ignoreUntilRef.current = Date.now() + 900;
    if (voiceModeRef.current) {
      window.setTimeout(() => {
        if (voiceModeRef.current && !speakingRef.current) startListen("loop");
      }, 700);
    }
  }

  async function absorbSpeech(body: string) {
    const merged = parseDraftFromSpeech(body, slotsRef.current, wizardRef.current);
    wizardRef.current = merged;
    setWizard({ ...merged });
    if (!voiceModeRef.current) return;
    const miss = missingScheduleFields(merged);
    if (miss[0]) await say(miss[0].ask);
    else await say("Все поля есть. Отправьте запрос — открою предпросмотр. Потом опубликовать.");
  }

  async function runCmd(cmd: string, extraBody = "") {
    if (extraBody && !voiceModeRef.current) {
      setAiPrompt((p) => {
        const n = p ? `${p} ${extraBody}` : extraBody;
        promptRef.current = n;
        return n;
      });
      await absorbSpeech(extraBody);
    }
    if (cmd === "отменить") {
      awaitingRevisionRef.current = false;
      cancelPreview();
      if (voiceModeRef.current) await say("Отменила предпросмотр.");
      return;
    }
    if (cmd === "переделать") {
      awaitingRevisionRef.current = true;
      if (voiceModeRef.current) await say("Что меняем? Как делаем?");
      else setMsg("Что меняем? Как делаем?");
      return;
    }
    if (cmd === "дальше") {
      setAiPrompt("");
      promptRef.current = "";
      setAiAdds([]);
      setAiChanges([]);
      setAiComment("");
      setInterim("");
      wizardRef.current = { ...EMPTY_WIZARD };
      setWizard({ ...EMPTY_WIZARD });
      if (voiceModeRef.current) await say("Хорошо, следующая группа. Назовите курс и возраст.");
      else setMsg("Поле очищено — можно говорить следующую группу.");
      return;
    }
    if (cmd === "готово" || cmd === "предпросмотр") {
      const w = wizardRef.current;
      const miss = missingScheduleFields(w);
      if (!miss.length && w.course) {
        setAiAdds([w]);
        addsRef.current = [w];
        setAiComment("Предпросмотр. Нажмите «Опубликовать изменения», если всё верно.");
        setMsg("Предпросмотр готов.");
        if (voiceModeRef.current) await say("Карточка на экране. Скажите опубликовать, если всё верно.");
        return;
      }
      const text = promptRef.current.trim();
      if (!text) {
        if (voiceModeRef.current) await say(miss[0]?.ask || "Сначала назовите курс.");
        else setMsg("Сначала скажите, какую группу добавить.");
        return;
      }
      setMsg("Готовлю предпросмотр…");
      await run("aiPreview", { prompt: text, ids: pickedRef.current.length ? pickedRef.current : slotsRef.current.map((s) => s.id) });
      if (voiceModeRef.current) await say("Предпросмотр готов. Скажите опубликовать или поправьте поля.");
      return;
    }
    if (cmd === "применить") {
      awaitingRevisionRef.current = false;
      if (!addsRef.current.length && !changesRef.current.length && wizardRef.current.course && !missingScheduleFields(wizardRef.current).length) {
        setAiAdds([wizardRef.current]);
        addsRef.current = [wizardRef.current];
      }
      await applyPreview();
      if (voiceModeRef.current) await say("Опубликовала на сайте. Скажите дальше, если нужна ещё группа.");
    }
  }

  function startListen(_mode: "once" | "loop") {
    const Ctor = speechCtor();
    if (!Ctor) {
      setMsg("Голосовой ввод в этом браузере не работает — напишите текст.");
      return;
    }
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = !voiceModeRef.current;
    rec.onresult = (e) => {
      if (pauseRef.current || speakingRef.current || Date.now() < ignoreUntilRef.current) return;
      let mid = "";
      for (let i = doneRef.current; i < e.results.length; i += 1) {
        const row = e.results[i] as unknown as { isFinal?: boolean; 0: { transcript: string } };
        const t = (row[0]?.transcript || "").replace(/\s+/g, " ").trim();
        if (!t) continue;
        if (row.isFinal) {
          accRef.current = accRef.current ? `${accRef.current} ${t}` : t;
          doneRef.current = i + 1;
        } else mid = t;
      }
      const shown = [accRef.current, mid].filter(Boolean).join(" ");
      if (!voiceModeRef.current) setInterim(shown);
      window.clearTimeout(speechTimer.current);
      if (parseVoice(shown).cmd) {
        const raw = shown;
        accRef.current = "";
        setInterim("");
        commitSpeech(raw);
        return;
      }
      if (!mid && accRef.current && accRef.current !== lastFinalRef.current) {
        const fin = accRef.current;
        speechTimer.current = window.setTimeout(() => {
          accRef.current = "";
          commitSpeech(fin);
        }, 700);
      }
    };
    rec.onerror = () => {
      /* onend перезапустит */
    };
    rec.onend = () => {
      setInterim("");
      if (pauseRef.current || speakingRef.current) return;
      if (voiceModeRef.current || dictationRef.current) {
        window.setTimeout(() => {
          if (speakingRef.current || pauseRef.current) return;
          if (!(voiceModeRef.current || dictationRef.current)) return;
          try {
            rec.start();
            setListen(true);
          } catch {
            startListen("loop");
          }
        }, 180);
      } else setListen(false);
    };
    recRef.current = rec;
    setListen(true);
    try {
      rec.start();
    } catch {
      setMsg("Не удалось включить микрофон. Разрешите доступ.");
    }
  }

  function stopListen() {
    voiceModeRef.current = false;
    dictationRef.current = false;
    pauseRef.current = false;
    speakingRef.current = false;
    setVoiceMode(false);
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    setListen(false);
    setInterim("");
    window.clearTimeout(speechTimer.current);
    accRef.current = "";
  }

  function toggleDictation() {
    if (listen && !voiceMode) {
      stopListen();
      return;
    }
    dictationRef.current = true;
    startListen("loop");
    setMsg("Слушаю. Говорите дальше, микрофон сам не выключаю. Стоп — ещё раз нажмите на микрофон.");
  }

  function toggleVoiceMode() {
    if (voiceMode) {
      stopListen();
      setAsk("");
      return;
    }
    setVoiceMode(true);
    voiceModeRef.current = true;
    dictationRef.current = false;
    startListen("loop");
    wizardRef.current = { ...EMPTY_WIZARD };
    setWizard({ ...EMPTY_WIZARD });
    void say("Привет, что будем делать сегодня?");
  }

  async function handleScheduleVoice(text: string) {
    const q0 = text.trim();
    if (!q0 || isEcho(q0) || busyVoiceRef.current) return;
    let q = q0;
    if (changesRef.current.length || addsRef.current.length) {
      if (isPreviewConfirm(q)) {
        await runCmd("применить");
        return;
      }
      if (isPreviewReject(q)) {
        const extra = leftoverAfterReject(q);
        if (leftoverLooksLikeEdit(extra)) {
          q = extra;
          awaitingRevisionRef.current = false;
        } else {
          awaitingRevisionRef.current = true;
          await say("Что меняем? Как делаем?");
          return;
        }
      } else if (awaitingRevisionRef.current || leftoverLooksLikeEdit(q)) {
        awaitingRevisionRef.current = false;
      } else {
        await say("Предпросмотр уже на экране. Скажите да — опубликую. Или скажите, что меняем.");
        return;
      }
    }
    busyVoiceRef.current = true;
    setAiPrompt(q);
    promptRef.current = q;
    setMsg("Смотрю расписание…");
    try {
      const res = await adminSchedule({ data: { token: token(), action: "voiceAsk", prompt: q, ids: pickedRef.current } as never });
      if (!res.ok) {
        await say("Нет, я не могу это поправить, потому что агент расписания не ответил.");
        return;
      }
      const kind = "kind" in res ? String(res.kind) : "edit";
      const reason = "reason" in res ? String(res.reason || "") : "";
      const answer = "answer" in res ? String(res.answer || "") : "";
      const action = "action" in res ? String(res.action || "") : "preview";
      if (kind === "refuse") {
        await say(`Нет, я не могу это поправить, потому что ${reason || "это не относится к расписанию занятий."}`);
        return;
      }
      if (kind === "question") {
        await say(answer || "В карточке группы на сайте этих данных нет.");
        return;
      }
      await say("Хорошо, сейчас всё поправим.");
      if (action === "pull") {
        await pullCrm();
        if (voiceModeRef.current) await say("Загрузила расписание из AlfaCRM.");
        return;
      }
      if (action === "push") {
        await pushCrm();
        if (voiceModeRef.current) await say("Выгрузила отмеченные группы в AlfaCRM.");
        return;
      }
      const ids = pickedRef.current.length ? pickedRef.current : slotsRef.current.map((s) => s.id);
      const preview = await run("aiPreview", { prompt: q, ids });
      const n = preview && "changes" in preview && Array.isArray(preview.changes) ? preview.changes.length : 0;
      const comment = preview && "comment" in preview ? String(preview.comment || "") : "";
      if (!n) {
        await say(comment || "Не нашла, что менять. Повторите: лимит мест и число.");
        return;
      }
      if (voiceModeRef.current) await say(`${comment || `Готово, ${n} групп.`} Скажите опубликовать.`);
    } finally {
      busyVoiceRef.current = false;
    }
  }

  async function pullCrm() {
    setBusy(true);
    setPull({ open: true, step: "Подключаюсь к AlfaCRM…", done: false, added: 0, updated: 0, total: 0, error: "" });
    const steps = ["Читаю филиалы и предметы…", "Загружаю группы и уроки…", "Сверяю с расписанием на сайте…"];
    let i = 0;
    const timer = window.setInterval(() => {
      i = Math.min(i + 1, steps.length - 1);
      setPull((u) => (u.done ? u : { ...u, step: steps[i] }));
    }, 1100);
    try {
      const res = await adminSchedule({ data: { token: token(), action: "pull" } });
      window.clearInterval(timer);
      take(res as never);
      if (!res.ok) {
        setPull((u) => ({ ...u, done: true, error: res.error || "AlfaCRM не ответила." }));
      } else {
        const added = Number((res as { added?: number }).added || 0);
        const updated = Number((res as { updated?: number }).updated || 0);
        const total = Array.isArray((res as { slots?: CrmSlot[] }).slots) ? (res as { slots: CrmSlot[] }).slots.length : 0;
        setDirty(new Set());
        setPull({ open: true, step: "", done: true, added, updated, total, error: "" });
        setMsg(`Загружено. Новых групп: ${added}. Обновлено: ${updated}. На сайте ${total}.`);
      }
    } catch {
      window.clearInterval(timer);
      setPull((u) => ({ ...u, done: true, error: "Не удалось загрузить." }));
    }
    setBusy(false);
  }

  async function pushCrm() {
    if (!pickedIds.length) {
      setPushUi({ open: true, step: "", done: true, created: 0, pushed: 0, failed: 0, error: "Отметьте группы чекбоксом слева от названия.", lines: [] });
      return;
    }
    setBusy(true);
    setPushUi({ open: true, step: "Создаю группы в AlfaCRM…", done: false, created: 0, pushed: 0, failed: 0, error: "", lines: [] });
    const steps = ["Сохраняю группу…", "Создаю регулярное расписание…", "Записываю номера gid обратно на сайт…"];
    let i = 0;
    const timer = window.setInterval(() => {
      i = Math.min(i + 1, steps.length - 1);
      setPushUi((u) => (u.done ? u : { ...u, step: steps[i] }));
    }, 900);
    try {
      const res = await adminSchedule({ data: { token: token(), action: "push", slots, ids: pickedIds } as never });
      window.clearInterval(timer);
      take(res as never);
      if (!res.ok) {
        setPushUi((u) => ({ ...u, done: true, error: res.error || "AlfaCRM не приняла выгрузку." }));
      } else {
        const rows = Array.isArray((res as { results?: { id: string; ok: boolean; groupId?: number; created?: boolean; error?: string }[] }).results)
          ? (res as { results: { id: string; ok: boolean; groupId?: number; created?: boolean; error?: string }[] }).results
          : [];
        const created = Number((res as { created?: number }).created || rows.filter((r) => r.created).length);
        const pushed = Number((res as { pushed?: number }).pushed || rows.filter((r) => r.ok).length);
        const failed = Number((res as { failed?: number }).failed || rows.filter((r) => !r.ok).length);
        const lines = rows.map((r) => {
          const s = (res as { slots?: CrmSlot[] }).slots?.find((x) => x.id === r.id);
          const name = s?.groupName || r.id;
          if (r.ok && r.created) return `Создана «${name}» · gid ${r.groupId}`;
          if (r.ok) return `Обновлена «${name}» · gid ${r.groupId || s?.groupId}`;
          return `Ошибка «${name}»: ${r.error || ""}`;
        });
        setDirty((d) => {
          const n = new Set(d);
          for (const id of pickedIds) n.delete(id);
          return n;
        });
        setPushUi({ open: true, step: "", done: true, created, pushed, failed, error: "", lines });
        setMsg(created ? `В AlfaCRM создано групп: ${created}. Номера gid записаны в расписание.` : `Выгружено: ${pushed}.`);
      }
    } catch {
      window.clearInterval(timer);
      setPushUi((u) => ({ ...u, done: true, error: "Не удалось выгрузить." }));
    }
    setBusy(false);
  }

  function cancelPreview() {
    setAiAdds([]);
    setAiChanges([]);
    setAiComment("");
    setMsg("Предпросмотр отменён.");
  }

  function patchAdd(i: number, field: keyof Draft, value: string | number) {
    setAiAdds((list) => list.map((a, n) => (n === i ? { ...a, [field]: value } : a)));
  }

  async function removeSlots(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(ids.length === 1 ? "Удалить эту группу из расписания на сайте? В AlfaCRM она останется." : `Удалить ${ids.length} групп из расписания на сайте? В AlfaCRM они останутся.`)) return;
    const res = await run("remove", { ids });
    if (res.ok) {
      setPicked({});
      setDirty((d) => {
        const n = new Set(d);
        for (const id of ids) n.delete(id);
        return n;
      });
      setMsg(ids.length === 1 ? "Группа убрана из расписания на сайте." : `Удалено групп: ${ids.length}.`);
    }
  }

  return (
    <section className="mt-10 space-y-4">
      <AdminSectionHead
        section="schedule"
        title="Расписание занятий"
        tip="Группы по школам и курсам. Можно править в таблице, сохранить на сайте, выгрузить в AlfaCRM, скачать или загрузить файл. ИИ меняет пачкой — всегда есть откат."
        aside={
          <label className="flex items-center gap-2 text-sm text-muted">
            Филиал
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-9 min-w-[14rem] rounded-full bg-surface-2 px-3 text-sm text-fg ring-1 ring-black/10"
            >
              {branchOpts.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </label>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-muted">
            Последняя загрузка: {when(at)} · {slots.length} слотов · {dirty.size ? `${dirty.size} не выгружены в CRM` : "совпадает с кабинетом"}
          </p>
          {mismatchCount.all ? (
            <span className="relative inline-flex">
              <button
                type="button"
                onClick={() => {
                  const next = !onlyMismatch;
                  setOnlyMismatch(next);
                  setPane("groups");
                  if (next) {
                    setOpenAll(true);
                    setAddOpen(false);
                  }
                }}
                className={cn(
                  "ra-mismatch peer inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.78rem] font-bold ring-1",
                  mismatchCount.hard
                    ? "bg-[#e11d48]/12 text-[#e11d48] ring-[#e11d48]/25"
                    : "bg-amber-100 text-amber-800 ring-amber-300/60",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", mismatchCount.hard ? "bg-[#e11d48]" : "bg-amber-600")} />
                {onlyMismatch ? "Все группы" : `Ошибки CRM · ${mismatchCount.all}${mismatchCount.hard ? ` · грубых ${mismatchCount.hard}` : ""}`}
              </button>
              <span className={cn("pointer-events-none absolute left-0 top-9 z-50 hidden w-[24rem] whitespace-pre-line peer-hover:block peer-focus:block", TIP_BOX)}>
                {mismatchCount.hard
                  ? `Грубых ${mismatchCount.hard}: название группы и предмет из разных школ.\n`
                  : ""}
                {mismatchCount.soft
                  ? `Мягких ${mismatchCount.soft}: одно направление, но название и предмет не совпадают.\n`
                  : ""}
                {"\n"}
                {mismatchCount.lines.slice(0, 6).join("\n\n")}
                {mismatchCount.lines.length > 6 ? `\n\nещё ${mismatchCount.lines.length - 6}` : ""}
                {"\n\nНажмите — на экране сразу откроются эти группы."}
              </span>
            </span>
          ) : null}
        </div>
      </AdminSectionHead>

      <div className="flex items-end gap-1 border-b border-black/10">
        {([
          ["groups", "Группы"],
          ["subjects", "Предметы"],
          ["map", "Соответствия"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPane(id)}
            className={cn(
              "rounded-t-xl px-7 py-2.5 text-base font-semibold transition-colors",
              pane === id ? "bg-primary text-white" : "bg-surface-2 text-fg hover:bg-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {pane === "subjects" ? <AdminSubjects /> : null}
      {pane === "map" ? <AdminScheduleMap embedded /> : null}
      {pane === "groups" ? (
      <div>
      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-visible pb-0.5">
        <Button type="button" size="sm" variant="secondary" className="h-8 shrink-0 px-3 text-[0.78rem]" disabled={busy} onClick={() => { setAddOpen((v) => !v); document.getElementById("ra-sched-ai")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
          Добавить расписание вручную
        </Button>
        <Button type="button" size="sm" className="h-8 shrink-0 px-3 text-[0.78rem]" variant="secondary" disabled={busy} onClick={() => void pullCrm()}>
          Загрузить из AlfaCRM
        </Button>
        <Button type="button" size="sm" className="h-8 shrink-0 px-3 text-[0.78rem]" variant="secondary" disabled={busy || !slots.length} onClick={async () => { const res = await run("save", { slots }); if (res.ok) setMsg("Сохранено на сайте. Страницы курсов обновятся сразу. В CRM — отдельной кнопкой."); }}>
          Сохранить на сайте
        </Button>
        <Button type="button" size="sm" className="h-8 shrink-0 px-3 text-[0.78rem]" variant="secondary" disabled={busy} onClick={() => void pushCrm()}>
          Выгрузить в AlfaCRM
        </Button>
        <div className="relative shrink-0" ref={fileRef}>
          <Button type="button" size="sm" className="h-8 px-3 text-[0.78rem]" variant="secondary" disabled={busy} onClick={() => setFileOpen((v) => !v)}>
            Файл
            <span className="text-[0.65rem]">▾</span>
          </Button>
          {fileOpen && typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={fileMenuRef}
                  className="fixed z-[80] min-w-[13rem] rounded-2xl bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.18)] ring-1 ring-black/10"
                  style={(() => {
                    const r = fileRef.current?.getBoundingClientRect();
                    return r ? { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 220)) } : { top: 0, left: 0 };
                  })()}
                >
                  <button
                    type="button"
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2"
                    onClick={async () => { setFileOpen(false); const res = await run("exportXls"); if (res.ok && "text" in res) download(String(res.filename), String(res.mime), String(res.text)); }}
                  >
                    Скачать Excel
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2"
                    onClick={async () => { setFileOpen(false); const res = await run("exportCsv"); if (res.ok && "text" in res) download(String(res.filename), String(res.mime), String(res.text)); }}
                  >
                    Скачать CSV
                  </button>
                  <label className="block w-full cursor-pointer rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2">
                    Импорт Excel/CSV
                    <input
                      type="file"
                      accept=".csv,.xls,.txt,text/csv"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        setFileOpen(false);
                        if (!f) return;
                        const text = await f.text();
                        setBusy(true);
                        const res = await adminSchedule({ data: { token: token(), action: "import", text } });
                        take(res as never);
                        setBusy(false);
                        setDirty(new Set());
                        if (res.ok) setMsg("Импортировано. Проверьте школы и при необходимости выгрузите в AlfaCRM.");
                      }}
                    />
                  </label>
                </div>,
                document.body,
              )
            : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button type="button" size="sm" className="h-8 shrink-0 px-3 text-[0.78rem]" variant="secondary" onClick={() => setOpenAll((v) => !v)}>
          {openAll ? "Свернуть всё" : "Раскрыть всё"}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 px-3 text-[0.78rem]"
          variant="secondary"
          disabled={busy || !pickedIds.length}
          onClick={() => void removeSlots(pickedIds)}
        >
          Удалить выбранные{pickedIds.length ? ` · ${pickedIds.length}` : ""}
        </Button>
        {versions.length && !onlyMismatch ? (
          <div className="relative shrink-0" ref={versionsRef}>
            <Button type="button" size="sm" className="h-8 px-3 text-[0.78rem]" variant="secondary" disabled={busy} onClick={() => setVersionsOpen((v) => !v)}>
              Версии{versions.length ? ` · ${versions.length}` : ""}
              <span className="text-[0.65rem]">▾</span>
            </Button>
            {versionsOpen && typeof document !== "undefined"
              ? createPortal(
                  <div
                    ref={versionsMenuRef}
                    className="fixed z-[80] w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.18)] ring-1 ring-black/10"
                    style={(() => {
                      const r = versionsRef.current?.getBoundingClientRect();
                      const width = 352;
                      const left = r ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) : 8;
                      return r ? { top: r.bottom + 6, left } : { top: 0, left: 8 };
                    })()}
                  >
                    <p className="px-2 pb-1 pt-1 text-[0.68rem] text-muted">Снимки расписания на сайте. Откат в CRM сам не уйдёт.</p>
                    <ul className="max-h-72 space-y-1 overflow-auto">
                      {versions.map((v) => (
                        <li key={v.at} className="flex items-start justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                          <span className="text-[0.78rem] leading-snug">
                            {when(v.at)} · {v.reason} · {v.count}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 text-xs font-semibold text-primary"
                            disabled={busy}
                            onClick={async () => {
                              setVersionsOpen(false);
                              await run("rollback", { at: v.at });
                              setDirty(new Set());
                              setMsg("Откатили снимок на сайте.");
                            }}
                          >
                            Откатить
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>,
                  document.body,
                )
              : null}
          </div>
        ) : null}
        </div>
      </div>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      {onlyMismatch ? null : (
      <article id="ra-sched-ai" className="sticky top-20 z-20 mt-6 rounded-3xl bg-gradient-to-br from-[#e8f0ff] via-white to-[#eef4ff] p-4 ring-2 ring-primary/35 shadow-[0_10px_28px_rgba(32,94,220,0.18)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="font-display text-xl text-primary">Добавить / исправить расписание</p>
            <InfoTip text="Стрелка отправляет запрос агенту и открывает предпросмотр. «Опубликовать изменения» записывает их в расписание на сайте. В CRM — отдельной выгрузкой." />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.72rem] text-muted">
            <span>отмечено {pickedIds.length}</span>
            <button type="button" className="font-semibold text-primary" onClick={() => setIds(slots.map((s) => s.id), true)}>
              Выделить всё
            </button>
            <button type="button" className="font-semibold text-primary" onClick={() => setPicked({})}>
              Снять
            </button>
          </div>
        </div>
        <p className="mt-2 text-[0.78rem] leading-relaxed text-muted">
          Стрелка — предпросмотр. После предпросмотра: <b>да</b>, <b>хорошо</b>, <b>делай</b>, <b>опубликовать</b> — применить. <b>нет</b>, <b>не надо</b>, <b>по-другому</b> — скажет, что меняем.
        </p>
        {ask ? <p className="mt-2 rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-fg">{ask}</p> : null}
        {wizard.course || wizard.day || wizard.branch || wizard.teacher ? (
          <p className="mt-2 flex flex-wrap gap-1.5 text-[0.72rem] text-muted">
            {wizard.course ? <span className="rounded-full bg-surface-2 px-2 py-0.5">{wizard.course}</span> : null}
            {wizard.age ? <span className="rounded-full bg-surface-2 px-2 py-0.5">{wizard.age}</span> : null}
            {wizard.day ? <span className="rounded-full bg-surface-2 px-2 py-0.5">{["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][wizard.day]}</span> : null}
            {wizard.timeFrom ? <span className="rounded-full bg-surface-2 px-2 py-0.5">{wizard.timeFrom}–{wizard.timeTo}</span> : null}
            {wizard.branch ? <span className="rounded-full bg-surface-2 px-2 py-0.5">{wizard.branch}</span> : null}
            {wizard.teacher ? <span className="rounded-full bg-surface-2 px-2 py-0.5">{wizard.teacher}</span> : null}
          </p>
        ) : null}
        <div className="mt-3 flex items-start gap-2">
          <textarea
            id="ra-sched-prompt"
            ref={promptEl}
            value={voiceMode ? aiPrompt : interim ? [listenBaseRef.current, interim].filter(Boolean).join(" ") : aiPrompt}
            onChange={(e) => { setAiPrompt(e.target.value); promptRef.current = e.target.value; }}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void runCmd("готово");
              }
            }}
            placeholder="Добавь художественную студию 3–4 года на Гражданской, вторник с 15:00 до 17:00, педагог Самсонова."
            className="min-h-10 min-w-0 flex-1 resize-none overflow-hidden rounded-xl bg-surface-2 px-3 py-2 text-sm leading-6 ring-1 ring-black/10"
          />
          <button
            type="button"
            title="Отправить запрос — предпросмотр"
            disabled={busy || (!aiPrompt.trim() && !wizard.course)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
            onClick={() => void runCmd("готово")}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M5 12h12M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            title={listen && !voiceMode ? "Стоп" : "Голосовой ввод в поле"}
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10", listen && !voiceMode ? "bg-primary text-white" : "bg-surface-2 text-fg")}
            onClick={toggleDictation}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
            </svg>
          </button>
            <Button type="button" size="sm" variant={voiceMode ? "primary" : "secondary"} className="h-10 shrink-0" onClick={toggleVoiceMode}>
              {voiceMode ? "Голосовой режим · вкл" : "Голосовой режим"}
            </Button>
        </div>
        {aiComment && !aiAdds.length && !aiChanges.length ? <p className="mt-2 text-sm text-muted">{aiComment}</p> : null}
        {aiAdds.length || aiChanges.length ? (
          <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-black/8">
            <p className="px-4 py-3 text-sm font-semibold">
                Предпросмотр
                {aiAdds.length ? ` · ${aiAdds.length} ${aiAdds.length === 1 ? "новая группа" : "новых групп"}` : ""}
                {aiChanges.length ? ` · ${aiChanges.length} ${aiChanges.length === 1 ? "правка" : "правок"}` : ""}
            </p>
              {aiAdds.length ? (
                <table className="w-full text-left text-sm">
                  <thead className="text-[0.65rem] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-2 py-2">Группа · №</th>
                      <th className="px-1 py-2 text-center">Возраст</th>
                      <th className="px-1 py-2 text-center">День</th>
                      <th className="px-1 py-2 text-center">С / до</th>
                      <th className="px-2 py-2">Филиал</th>
                      <th className="px-2 py-2">Педагог</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiAdds.map((a, i) => (
                      <tr key={`add-${i}`} className="border-t border-black/6">
                        <td className="px-2 py-1.5">
                          <input value={a.course} onChange={(e) => patchAdd(i, "course", e.target.value)} title={a.course} className="h-8 w-full min-w-[10rem] rounded-md bg-surface-2 px-2 text-[0.8rem] ring-1 ring-black/8" />
                        </td>
                        <td className="px-1 py-1.5">
                          <input value={a.age} onChange={(e) => patchAdd(i, "age", e.target.value)} className={cn(cell, "w-full")} />
                        </td>
                        <td className="px-1 py-1.5">
                          <select value={a.day} onChange={(e) => patchAdd(i, "day", Number(e.target.value))} className={cn(cell, "w-full px-0")}>
                            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                              <option key={d} value={d}>{DAYS_SHORT[d]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <input value={a.timeFrom} onChange={(e) => patchAdd(i, "timeFrom", e.target.value)} className={cn(cell, "w-[3.2rem]")} />
                            <input value={a.timeTo} onChange={(e) => patchAdd(i, "timeTo", e.target.value)} className={cn(cell, "w-[3.2rem]")} />
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={a.branch} onChange={(e) => patchAdd(i, "branch", e.target.value)} className="h-8 w-full rounded-md bg-surface-2 px-1 text-[0.72rem] ring-1 ring-black/8">
                            {BRANCH_OPTS.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input list="ra-teachers" value={a.teacher} onChange={(e) => patchAdd(i, "teacher", e.target.value)} className="h-8 w-full rounded-md bg-surface-2 px-2 text-[0.75rem] ring-1 ring-black/8" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {aiChanges.length ? (
                <div className="max-h-72 space-y-3 overflow-auto border-t border-black/6 px-3 py-3">
                  {(() => {
                    const bags = new Map<string, { title: string; rows: typeof aiChanges }>();
                    for (const c of aiChanges) {
                      const s = slots.find((x) => x.id === c.id);
                      const title = s ? `${s.school} · ${s.course || s.groupName}` : "Правки";
                      if (!bags.has(title)) bags.set(title, { title, rows: [] });
                      bags.get(title)!.rows.push(c);
                    }
                    return [...bags.values()].map((bag) => (
                      <div key={bag.title}>
                        <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-muted">{bag.title}</p>
                        <ul className="space-y-1.5">
                          {bag.rows.map((c, i) => {
                            const s = slots.find((x) => x.id === c.id);
                            return (
                              <li key={`${c.id}-${c.field}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f3f5f8] px-3 py-2 text-sm">
                                <span className="min-w-0 flex-1 truncate font-medium" title={s?.groupName}>{s?.groupName || c.id}</span>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-semibold text-muted">{FIELD_RU[c.field] || c.field}</span>
                                <span className="tabular-nums text-muted">{c.from || "—"}</span>
                                <span className="text-muted">→</span>
                                <span className="tabular-nums font-semibold text-fg">{c.to}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ));
                  })()}
                </div>
              ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/6 px-4 py-3">
              <Button type="button" variant="secondary" onClick={cancelPreview}>
                Отменить изменения
              </Button>
              <Button type="button" disabled={busy} onClick={() => void applyPreview()}>
                Опубликовать изменения
              </Button>
            </div>
          </div>
        ) : null}
      </article>
      )}

      {onlyMismatch || !addOpen ? null : (
        <article className="rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
          <p className="font-display text-xl">Новая группа</p>
          <p className="mt-1 text-sm text-muted">Поля по порядку. Стрелка у запроса кладёт группу в предпросмотр — на сайт после «Опубликовать изменения».</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Школа</span>
              <select value={draft.school} onChange={(e) => setDraft((d) => ({ ...d, school: e.target.value, course: "" }))} className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10">
                <option value="">Выберите школу</option>
                {(SCHOOL_ORDER.filter((s) => s !== "Прочее")).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Курс</span>
              <input list="ra-courses" value={draft.course} onChange={(e) => setDraft((d) => ({ ...d, course: e.target.value }))} placeholder="Художественная студия (5-6 лет)" className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              <datalist id="ra-courses">
                {(coursesOf.get(draft.school) || []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Возраст</span>
              <input value={draft.age} onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))} placeholder="5-6 лет" className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">День недели</span>
              <select value={draft.day} onChange={(e) => setDraft((d) => ({ ...d, day: Number(e.target.value) }))} className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>{["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][d]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">С</span>
              <input value={draft.timeFrom} onChange={(e) => setDraft((d) => ({ ...d, timeFrom: e.target.value }))} placeholder="18:30" className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">До</span>
              <input value={draft.timeTo} onChange={(e) => setDraft((d) => ({ ...d, timeTo: e.target.value }))} placeholder="20:00" className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Филиал</span>
              <select value={draft.branch} onChange={(e) => setDraft((d) => ({ ...d, branch: e.target.value }))} className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10">
                <option value="">Выберите филиал</option>
                {BRANCH_OPTS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Педагог</span>
              <input list="ra-teachers" value={draft.teacher} onChange={(e) => setDraft((d) => ({ ...d, teacher: e.target.value }))} placeholder="Фамилия из списка" className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              <datalist id="ra-teachers">
                {teachers.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              disabled={busy || !draft.school || !draft.course || !draft.branch}
              onClick={() => {
                setAiAdds((list) => [...list, { ...draft }]);
                setAiComment(`В предпросмотре ${aiAdds.length + 1} групп. Нажмите «Опубликовать изменения».`);
                setDraft(EMPTY_DRAFT);
              }}
            >
              Готово
            </Button>
          </div>
        </article>
      )}

      <div id="ra-mismatch-list" className="mt-8 space-y-4 scroll-mt-24">
        {tree.map((sch) => {
          const schoolIds = sch.courses.flatMap((c) => c.items.map((s) => s.id));
          return (
          <article key={sch.school} className="rounded-3xl bg-surface shadow-[var(--shadow-border)]">
            <div className="flex w-full items-center gap-3 px-5 py-4">
              <CheckBox ids={schoolIds} picked={picked} onToggle={setIds} />
              <button type="button" className="flex min-w-0 flex-1 items-center justify-between text-left" onClick={() => { setOpenAll(false); setOpenSchool((v) => (v === sch.school ? "" : sch.school)); }}>
                <span className="font-display text-xl">{sch.school}</span>
                <span className="text-sm text-muted">
                  {sch.courses.length
                    ? `${sch.courses.reduce((n, c) => n + c.items.length, 0)} слотов · ${sch.courses.length} курсов`
                    : "не заполнено"}
                </span>
              </button>
            </div>
            {openAll || openSchool === sch.school ? (
              sch.courses.length ? (
                <div className="space-y-2 px-3 pb-3">
                {sch.courses.map((c) => {
                  const courseIds = c.items.map((s) => s.id);
                  return (
                  <div key={c.course} className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/8">
                    <div className="flex items-center gap-3 bg-surface-2 px-4 py-2.5">
                      <CheckBox ids={courseIds} picked={picked} onToggle={setIds} />
                      <button type="button" className="flex min-w-0 flex-1 items-center justify-between text-left" onClick={() => setOpenCourse((v) => (v === c.course ? "" : c.course))}>
                        <span className="font-medium">{c.course}</span>
                        <span className="text-xs text-muted">{c.items.length}</span>
                      </button>
                    </div>
                    {openAll || openCourse === c.course ? (
                      <div>
                        <table className="w-full text-left text-sm">
                          <colgroup>
                            <col className="w-10" />
                            <col />
                            <col className="w-[4.6rem]" />
                            <col className="w-[3.4rem]" />
                            <col className="w-[7.2rem]" />
                            <col className="w-[5.2rem]" />
                            <col className="w-[7.5rem]" />
                            <col className="w-36" />
                            <col className="w-[4.4rem]" />
                            <col className="w-[5.5rem]" />
                            <col className="w-10" />
                            <col className="w-8" />
                          </colgroup>
                          <thead className="text-[0.65rem] uppercase tracking-wider text-muted">
                            <tr>
                              <th className="px-2 py-2" />
                              <th className="px-2 py-2">Группа · №</th>
                              <th className="px-1 py-2 text-center">Возраст</th>
                              <th className="px-1 py-2 text-center">День</th>
                              <th className="px-1 py-2 text-center">С / до</th>
                              <th className="px-1 py-2 text-center">×нед</th>
                              <th className="px-2 py-2">Филиал</th>
                              <th className="px-2 py-2">Педагог</th>
                              <th className="px-1 py-2 text-center">Места</th>
                              <th className="px-2 py-2">Кто учится</th>
                              <th className="px-1 py-2 text-center">Подробно</th>
                              <th className="px-1 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {c.items.map((s) => {
                              const key = `${s.branchId}-${s.groupId}`;
                              const names = who[key];
                              const mm = slotMismatch(s);
                              const open = detail?.id === s.id;
                              return (
                              <Fragment key={s.id}>
                              <tr
                                id={`ra-slot-${s.id}`}
                                className={cn("border-t border-black/6", dirty.has(s.id) && "bg-primary/5", flash.has(s.id) && "ra-flash", mm.level === "hard" && "bg-red-50", mm.level === "soft" && !dirty.has(s.id) && "bg-amber-50/80")}
                              >
                                <td className="px-2 py-1.5 align-middle">
                                  <div className="flex items-center gap-1.5">
                                    <CheckBox ids={[s.id]} picked={picked} onToggle={setIds} />
                                    <CrmDot s={s} />
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    {s.groupId ? <span className="w-8 shrink-0 text-right text-[0.7rem] font-semibold tabular-nums text-muted">{s.groupId}</span> : <span className="w-8 shrink-0" />}
                                    {mm.level ? <MismatchDot text={mismatchHint(s)} /> : null}
                                    <GroupNameField value={s.groupName} subject={s.subject} onChange={(v) => patch(s.id, "groupName", v)} />
                                  </div>
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <input value={s.age} onChange={(e) => patch(s.id, "age", e.target.value)} className={box} />
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <select value={shownBeat(s).day} onChange={(e) => patchBeat(s, "day", Number(e.target.value))} className={cn(box, "px-0")}>
                                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                                      <option key={d} value={d}>
                                        {["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][d]}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <div className="flex items-center justify-center gap-1">
                                    <input value={shownBeat(s).timeFrom} onChange={(e) => patchBeat(s, "timeFrom", e.target.value)} className={box} />
                                    <input value={shownBeat(s).timeTo} onChange={(e) => patchBeat(s, "timeTo", e.target.value)} className={box} />
                                  </div>
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <WeekDots
                                    s={s}
                                    index={view[s.id] || 0}
                                    onView={(i) => setView((v) => ({ ...v, [s.id]: i }))}
                                    onAdd={(b) => addBeat(s, b)}
                                  />
                                </td>
                                <td className="px-2 py-1.5 align-middle text-[0.7rem] leading-tight text-muted">
                                  <span className="block">{s.city}</span>
                                  <span className="block">{s.branch}</span>
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                  <input value={s.teacher} onChange={(e) => patch(s.id, "teacher", e.target.value)} className="h-8 w-full rounded-md bg-surface-2 px-2 text-[0.75rem] ring-1 ring-black/8" />
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <input value={s.limit} onChange={(e) => patch(s.id, "limit", Number(e.target.value) || 0)} className={cn(cell, "w-7")} />
                                    <span className="text-[0.65rem] text-muted">/{s.taken}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                  <WhoTip names={names} onNeed={() => void loadWho(s)} />
                                </td>
                                <td className="px-1 py-1.5 align-middle text-center">
                                  <DetailsBtn on={open} onClick={() => void openDetail(s)} />
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <button type="button" title="Удалить из расписания" className="text-xs font-semibold text-muted hover:text-red-600" onClick={() => void removeSlots([s.id])}>
                                    ×
                                  </button>
                                </td>
                              </tr>
                              </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                  );
                })}
                </div>
              ) : (
                <p className="border-t border-black/6 px-5 py-4 text-sm text-muted">Нет групп. Привяжите предметы этой школы в разделе «Соответствия».</p>
              )
            ) : null}
          </article>
          );
        })}
        {slots.length ? null : <p className="text-sm text-muted">Пока пусто — нажмите «Загрузить из AlfaCRM».</p>}
      </div>
      </div>
      ) : null}
      {detail
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-8" onClick={() => { setPupil(null); setDetail(null); }}>
              <article
                className="relative my-4 w-full max-w-4xl rounded-3xl p-5 shadow-[0_18px_50px_rgba(15,23,42,0.28)] md:p-6"
                style={{ background: ADMIN_PANEL_BLUE }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted">Группа {detail.groupId || "без номера"}</p>
                    <h3 className="font-display text-2xl">{detail.slot.groupName}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {detail.slot.age} · {detail.slot.teacher} · {detail.slot.city}, {detail.slot.branch}
                    </p>
                  </div>
                  <button type="button" className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-muted ring-1 ring-black/8" onClick={() => { setPupil(null); setDetail(null); }}>
                    Закрыть
                  </button>
                </div>
                {detail.loading ? (
                  <p className="mt-4 text-sm text-muted">Загружаю настройки группы из AlfaCRM…</p>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <GroupLessonStrip lessons={detail.calendar} group={detail.slot.groupName} subject={detail.slot.subject} teacher={detail.slot.teacher} />
                    <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                      Предмет
                      <select value={detail.subjectId || ""} onChange={(e) => setDetail((d) => (d ? { ...d, subjectId: Number(e.target.value) || 0 } : d))} className="mt-1 h-10 w-full rounded-md bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8">
                        <option value="">— не выбран —</option>
                        {subjects.map((sub) => (
                          <option key={sub.id} value={sub.id}>{sub.name} · id {sub.id}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                      Описание
                      <input value={detail.description} onChange={(e) => setDetail((d) => (d ? { ...d, description: e.target.value } : d))} className="mt-1 h-10 w-full rounded-md bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8" />
                    </label>
                    <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                      Хэштеги
                      <input value={detail.hashtags} onChange={(e) => setDetail((d) => (d ? { ...d, hashtags: e.target.value } : d))} className="mt-1 h-10 w-full rounded-md bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8" />
                    </label>
                    <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                      Примечания
                      <input value={detail.remarks} onChange={(e) => setDetail((d) => (d ? { ...d, remarks: e.target.value } : d))} className="mt-1 h-10 w-full rounded-md bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8" />
                    </label>
                    <div className="flex flex-wrap items-end gap-2 md:col-span-2 md:flex-nowrap">
                      <label className="block shrink-0 text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                        Период
                        <span className="mt-1 flex items-center gap-1">
                          <input value={detail.bDate} onChange={(e) => setDetail((d) => (d ? { ...d, bDate: e.target.value } : d))} placeholder="с" className="h-10 w-[7.4rem] rounded-md bg-white px-2 text-center text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8" />
                          <span className="text-[0.7rem] font-medium normal-case text-muted">до</span>
                          <input value={detail.eDate} onChange={(e) => setDetail((d) => (d ? { ...d, eDate: e.target.value } : d))} placeholder="до" className="h-10 w-[7.4rem] rounded-md bg-white px-2 text-center text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8" />
                        </span>
                      </label>
                      <label className="block min-w-[9.5rem] shrink-0 text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                        Запись
                        <a href={detail.signup || leadHref(detail.slot)} target="_blank" rel="noreferrer" className="mt-1 flex h-10 items-center justify-center whitespace-nowrap rounded-md bg-white px-2.5 text-[0.8rem] font-semibold normal-case tracking-normal text-primary ring-1 ring-black/8">
                          запись в группу {detail.groupId || "—"}
                        </a>
                      </label>
                      <label className="block min-w-0 flex-1 text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                        Уровень знаний
                        <select value={detail.levelId || ""} onChange={(e) => setDetail((d) => (d ? { ...d, levelId: Number(e.target.value) || 0 } : d))} className="mt-1 h-10 w-full rounded-md bg-white px-2 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8">
                          <option value="">— не задан —</option>
                          {levels.map((lv) => (
                            <option key={lv.id} value={lv.id}>{lv.name}</option>
                          ))}
                          {detail.levelId && !levels.some((lv) => lv.id === detail.levelId) ? <option value={detail.levelId}>Уровень {detail.levelId}</option> : null}
                        </select>
                      </label>
                      <label className="block min-w-0 flex-[1.2] text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                        Статус
                        <select value={detail.statusId || ""} onChange={(e) => setDetail((d) => (d ? { ...d, statusId: Number(e.target.value) || 0 } : d))} className="mt-1 h-10 w-full rounded-md bg-white px-2 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8">
                          <option value="">— не задан —</option>
                          {GROUP_STATUS.map((st) => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block min-w-0 flex-1 text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                        Отработка
                        <input value={detail.makeup} onChange={(e) => setDetail((d) => (d ? { ...d, makeup: e.target.value } : d))} className="mt-1 h-10 w-full rounded-md bg-white px-2 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8" />
                      </label>
                    </div>
                    <div className="flex items-end justify-end md:col-span-2">
                      <Button type="button" disabled={detail.saving} onClick={() => void saveDetail()}>Сохранить в AlfaCRM</Button>
                    </div>
                  </div>
                )}
                <section className="mt-5 rounded-2xl bg-white/80 p-4 ring-1 ring-black/6">
                  <div className="flex items-baseline justify-between gap-3">
                    <h4 className="font-display text-xl">Состав группы</h4>
                    <p className="text-sm text-muted">
                      {detail.membersLoading ? "загружаю…" : `${detail.members.length} учатся · ${detail.archive.length} в архиве`}
                    </p>
                  </div>
                  {detail.membersLoading ? (
                    <p className="mt-3 text-sm text-muted">Подгружаю учеников из AlfaCRM…</p>
                  ) : (
                    <>
                      <MemberGrid title="Учатся сейчас" items={detail.members} onOpen={(m) => void openPupil(m)} />
                      <MemberGrid title="Архив" items={detail.archive} onOpen={(m) => void openPupil(m)} archive />
                      {!detail.members.length && !detail.archive.length ? <p className="mt-3 text-sm text-muted">В группе пока никого нет.</p> : null}
                    </>
                  )}
                </section>
                {pupil
                  ? (
                    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/35 p-4 md:p-10" onClick={() => setPupil(null)}>
                      <div className="max-h-[min(82vh,720px)] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.28)]" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted">Карточка ученика</p>
                            <h4 className="font-display text-2xl">{pupil.name || "Без имени"}</h4>
                            <p className="mt-1 text-sm text-muted">
                              {[pupil.gender, pupil.age, pupil.status].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <button type="button" className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-muted" onClick={() => setPupil(null)}>Назад</button>
                        </div>
                        <dl className="mt-4 grid gap-2 text-sm">
                          {pupil.dob ? <div><dt className="text-[0.68rem] uppercase tracking-wider text-muted">Дата рождения</dt><dd>{pupil.dob}{pupil.age ? ` · ${pupil.age}` : ""}</dd></div> : null}
                          {pupil.parent ? <div><dt className="text-[0.68rem] uppercase tracking-wider text-muted">Заказчик</dt><dd>{pupil.parent}</dd></div> : null}
                          {pupil.phones.length ? <div><dt className="text-[0.68rem] uppercase tracking-wider text-muted">Телефоны</dt><dd className="space-y-0.5">{pupil.phones.map((ph) => <a key={ph} href={`tel:${ph}`} className="block text-primary">{ph}</a>)}</dd></div> : null}
                          {pupil.emails.length ? <div><dt className="text-[0.68rem] uppercase tracking-wider text-muted">Почта</dt><dd>{pupil.emails.join(", ")}</dd></div> : null}
                          {pupil.address ? <div><dt className="text-[0.68rem] uppercase tracking-wider text-muted">Адрес</dt><dd>{pupil.address}</dd></div> : null}
                          {pupil.paidTill ? <div><dt className="text-[0.68rem] uppercase tracking-wider text-muted">Оплачено до</dt><dd>{pupil.paidTill}</dd></div> : null}
                          {pupil.note ? <div><dt className="text-[0.68rem] uppercase tracking-wider text-muted">Заметка CRM</dt><dd>{pupil.note}</dd></div> : null}
                        </dl>
                        <a href={pupil.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-primary">Открыть в AlfaCRM</a>
                        <h5 className="mt-5 font-display text-lg">Коммуникации</h5>
                        {pupilLoading ? <p className="mt-2 text-sm text-muted">Подгружаю переписку…</p> : null}
                        <div className="mt-2 space-y-2">
                          {pupil.comms.length ? pupil.comms.map((c, i) => (
                            <div key={c.id || i} className={cn("rounded-2xl px-3 py-2.5 text-sm ring-1 ring-black/6", c.incoming ? "bg-[#f3f5f8]" : "bg-primary/8")}>
                              <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                                {[c.at, c.channel, c.who].filter(Boolean).join(" · ")}
                                {c.incoming ? " · входящее" : ""}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{c.text}</p>
                            </div>
                          )) : pupilLoading ? null : <p className="text-sm text-muted">Переписки в карточке пока нет.</p>}
                        </div>
                      </div>
                    </div>
                  )
                  : null}
              </article>
            </div>,
            document.body,
          )
        : null}
      {pull.open
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => pull.done && setPull((u) => ({ ...u, open: false }))}>
              <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.28)]" onClick={(e) => e.stopPropagation()}>
                <p className="font-display text-2xl">{pull.done ? pull.error ? "Не загрузилось" : "Загрузка завершена" : "Загрузка из AlfaCRM"}</p>
                {!pull.done ? (
                  <div className="mt-5 flex items-start gap-3">
                    <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                    <p className="text-sm text-fg">{pull.step}</p>
                  </div>
                ) : pull.error ? (
                  <p className="mt-4 text-sm text-red-600">{pull.error}</p>
                ) : (
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="rounded-2xl bg-[#f3f5f8] px-4 py-3">
                      Новых групп: <b>{pull.added}</b>
                    </p>
                    <p className="rounded-2xl bg-[#f3f5f8] px-4 py-3">
                      Обновлено на сайте: <b>{pull.updated}</b>
                    </p>
                    <p className="rounded-2xl bg-[#f3f5f8] px-4 py-3">
                      Всего в расписании: <b>{pull.total}</b>
                    </p>
                    <p className="pt-1 text-[0.78rem] text-muted">Эти группы сразу видны на страницах курсов и в разделе «Расписание».</p>
                  </div>
                )}
                {pull.done ? (
                  <div className="mt-5 flex justify-end">
                    <Button type="button" onClick={() => setPull((u) => ({ ...u, open: false }))}>
                      Закрыть
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
      {pushUi.open
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => pushUi.done && setPushUi((u) => ({ ...u, open: false }))}>
              <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.28)]" onClick={(e) => e.stopPropagation()}>
                <p className="font-display text-2xl">{pushUi.done ? pushUi.error ? "Выгрузка не прошла" : "Выгрузка завершена" : "Выгрузка в AlfaCRM"}</p>
                {!pushUi.done ? (
                  <div className="mt-5 flex items-start gap-3">
                    <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                    <p className="text-sm text-fg">{pushUi.step}</p>
                  </div>
                ) : pushUi.error ? (
                  <p className="mt-4 text-sm text-red-600">{pushUi.error}</p>
                ) : (
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="rounded-2xl bg-[#f3f5f8] px-4 py-3">Создано новых групп: <b>{pushUi.created}</b></p>
                    <p className="rounded-2xl bg-[#f3f5f8] px-4 py-3">Успешно выгружено: <b>{pushUi.pushed}</b></p>
                    {pushUi.failed ? <p className="rounded-2xl bg-[#f3f5f8] px-4 py-3">Ошибки: <b>{pushUi.failed}</b></p> : null}
                    {pushUi.lines.length ? (
                      <ul className="max-h-48 space-y-1 overflow-auto rounded-2xl bg-[#f3f5f8] px-4 py-3 text-[0.78rem]">
                        {pushUi.lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="pt-1 text-[0.78rem] text-muted">Сначала группа, затем регулярный урок с предметом. Новый gid записан в столбец «Запись».</p>
                  </div>
                )}
                {pushUi.done ? (
                  <div className="mt-5 flex justify-end">
                    <Button type="button" onClick={() => setPushUi((u) => ({ ...u, open: false }))}>
                      Закрыть
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
