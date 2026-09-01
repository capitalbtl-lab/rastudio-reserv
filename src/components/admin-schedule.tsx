"use client";

import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { createPortal } from "react-dom";
import { adminSchedule } from "@/data/admin-schedule";
import { type CrmSlot } from "@/data/crm-slots-core";
import { Button } from "@/components/ui/button";
import { InfoTip, TipWrap } from "@/components/info-tip";
import { AdminSectionHead } from "@/components/admin-self-test";
import { SCHOOLS, BRANCHES } from "@/data/site";
import { SCHOOL_ORDER } from "@/data/crm-slots-core";
import { splitCourseAge } from "@/data/prices-core";
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

function parseAnyDate(s: string) {
  const t = String(s || "").trim();
  const ru = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

function slotCalendar(s: CrmSlot): GroupCalLesson[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseAnyDate(s.bDate) || today;
  const end = parseAnyDate(s.eDate) || new Date(start.getFullYear(), start.getMonth() + 10, 0);
  const beats = s.beats?.length ? s.beats : [{ day: s.day, timeFrom: s.timeFrom, timeTo: s.timeTo }];
  const out: GroupCalLesson[] = [];
  for (const b of beats) {
    const want = Number(b.day || s.day || 0);
    if (!want) continue;
    const js = want === 7 ? 0 : want;
    const cur = new Date(start);
    while (cur.getDay() !== js) cur.setDate(cur.getDate() + 1);
    while (cur <= end && out.length < 120) {
      out.push({
        date: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`,
        from: String(b.timeFrom || ""),
        to: String(b.timeTo || ""),
        status: 0,
        type: "Групповое",
      });
      cur.setDate(cur.getDate() + 7);
    }
  }
  return out;
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

function GroupLessonStrip({ lessons }: { lessons: GroupCalLesson[] }) {
  const today = todayYmd();
  const [range, setRange] = useState<(typeof RANGE_OPTS)[number]["id"]>("10");
  const all = useMemo(() => [...lessons].sort((a, b) => a.date.localeCompare(b.date)), [lessons]);
  const items = useMemo(() => {
    const past = all.filter((l) => l.date < today);
    const future = all.filter((l) => l.date > today);
    const todayHit = all.find((l) => l.date === today) || { date: today, from: "", to: "", status: -1, type: "сегодня" };
    if (range === "10") return [...past.slice(-10), todayHit, ...future.slice(0, 10)];
    const days = Number(range);
    const from = shiftYmd(today, -days);
    const to = shiftYmd(today, days);
    const window = all.filter((l) => l.date >= from && l.date <= to);
    if (!window.some((l) => l.date === today)) {
      const i = window.findIndex((l) => l.date > today);
      const next = [...window];
      next.splice(i < 0 ? next.length : i, 0, todayHit);
      return next;
    }
    return window;
  }, [all, range, today]);
  return (
    <div className="md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted">Расписание занятий</p>
        <div className="flex items-center gap-2">
          <p className="text-[0.7rem] text-muted">{items.length} из {all.length}</p>
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
        {items.map((l) => {
          const d = parseYmd(l.date);
          const isToday = l.date === today;
          const past = l.date < today;
          const time = l.from && l.to ? `${l.from}–${l.to}` : l.from || "";
          return (
            <div
              key={l.date}
              title={time ? `${l.date} ${time}` : l.date}
              className={cn(
                "flex h-11 min-w-[3.15rem] flex-col items-center justify-center rounded-[4px] px-1.5 text-center leading-tight",
                isToday && "bg-[#2f9a4a] text-white",
                !isToday && past && "bg-[#e4f3e2] text-[#5b7a58]",
                !isToday && !past && "bg-[#d4efd0] text-[#1e5c28] ring-1 ring-[#b7dcb4]",
              )}
            >
              {isToday ? (
                <span className="text-[0.58rem] font-semibold uppercase tracking-wider text-white/90">сегодня</span>
              ) : (
                <span className="text-[0.58rem] font-semibold uppercase tracking-wider opacity-70">{WD[(d.getDay() + 6) % 7]}</span>
              )}
              <span className="text-[0.78rem] font-semibold tabular-nums">
                {d.getDate()} {MONTHS_SHORT[d.getMonth()]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function siteBranchAddress(branchId: number, city = "", branch = "") {
  const byId: Record<number, (typeof BRANCHES)[number] | undefined> = {
    1: BRANCHES[1],
    2: BRANCHES[0],
    3: BRANCHES[2],
  };
  const hit = byId[branchId];
  if (hit) return `${hit.city}, ${hit.address}`;
  const hay = `${city} ${branch}`.toLowerCase();
  const found = BRANCHES.find((b) => hay.includes("гражданск") && b.address.includes("Гражданская")
    || hay.includes("октябрьск") && b.address.includes("Октябрьской")
    || hay.includes("луховиц") && b.city === "Луховицы"
    || hay.includes("пушкин") && b.address.includes("Пушкина"));
  return found ? `${found.city}, ${found.address}` : [city, branch].filter(Boolean).join(", ");
}

function descriptionFromSite(note: string, branchId: number, city = "", branch = "") {
  const addr = siteBranchAddress(branchId, city, branch);
  const t = String(note || "").trim();
  if (!t || /^https?:\/\//i.test(t) || /rastudio\.org/i.test(t)) return addr;
  return t;
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
  loading: boolean;
  saving: boolean;
};

function GroupNameField({ value, onChange, subject }: { value: string; onChange: (v: string) => void; subject?: string }) {
  const src = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, height: 32, width: 160 });

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
    if (!open) return;
    place();
    function onScroll() {
      place();
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, value]);

  return (
    <>
      <input
        ref={src}
        value={value}
        title={subject ? `${value} · предмет: ${subject}` : value}
        onChange={(e) => onChange(e.target.value)}
        onMouseEnter={() => {
          setOpen(true);
          place();
        }}
        onFocus={() => {
          setOpen(true);
          place();
        }}
        className="h-8 w-full min-w-[10rem] rounded-md bg-surface-2 px-2 text-[0.8rem] ring-1 ring-black/8"
      />
      {open
        ? createPortal(
            <input
              value={value}
              autoFocus={false}
              onChange={(e) => onChange(e.target.value)}
              onMouseLeave={() => setOpen(false)}
              onBlur={() => setOpen(false)}
              style={{ top: pos.top, left: pos.left, height: pos.height, width: pos.width }}
              className="fixed z-[75] rounded-md bg-white px-2 text-[0.8rem] shadow-[0_8px_28px_rgba(15,23,42,0.22)] ring-1 ring-black/20"
            />,
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
              className="pointer-events-none fixed z-[80] w-[15rem] rounded-xl bg-neutral-700 px-3 py-2 text-left text-[0.75rem] leading-snug text-white shadow-[0_10px_28px_rgba(15,23,42,0.28)]"
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

export function AdminSchedule() {
  const [slots, setSlots] = useState<CrmSlot[]>([]);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openSchool, setOpenSchool] = useState("");
  const [openCourse, setOpenCourse] = useState("");
  const [openAll, setOpenAll] = useState(false);
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
  const [pushUi, setPushUi] = useState({ open: false, step: "", done: false, created: 0, pushed: 0, failed: 0, error: "", lines: [] as string[] });
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [subjects, setSubjects] = useState<CrmSubject[]>([]);
  const [levels, setLevels] = useState<{ id: number; name: string }[]>(SEED_LEVELS);
  const fileRef = useRef<HTMLDivElement>(null);
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
      if (!fileRef.current?.contains(e.target as Node)) setFileOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

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
      return;
    }
    setDetail({
      id: s.id,
      groupId: s.groupId,
      branchId: s.branchId,
      description: descriptionFromSite(s.description || s.groupNote || "", s.branchId, s.city, s.branch),
      remarks: s.remarks || "",
      hashtags: (s.hashtags || "").replace(/\s+/g, " ").trim(),
      makeup: s.makeup || "",
      statusId: s.statusId || 0,
      bDate: s.bDate || "",
      eDate: s.eDate || "",
      levelId: s.levelId || 0,
      signup: leadHref(s),
      subjectId: s.subjectId || 0,
      calendar: slotCalendar(s),
      loading: Boolean(s.groupId),
      saving: false,
    });
    if (!s.groupId) {
      const sub = await adminSchedule({ data: { token: token(), action: "subjectsGet" } as never });
      if (sub.ok && "subjects" in sub && Array.isArray(sub.subjects)) setSubjects(sub.subjects as CrmSubject[]);
      setDetail((d) => (d && d.id === s.id ? { ...d, loading: false } : d));
      return;
    }
    const res = await adminSchedule({ data: { token: token(), action: "groupGet", groupId: s.groupId, branchId: s.branchId } as never });
    if (!res.ok || !("group" in res) || !res.group) {
      setDetail((d) => (d && d.id === s.id ? { ...d, loading: false } : d));
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
      d && d.id === s.id
        ? {
            ...d,
            description: descriptionFromSite(g.description || g.note || "", s.branchId, s.city, s.branch),
            remarks: g.remarks || "",
            hashtags: (g.hashtags || "").replace(/\s+/g, " ").trim(),
            makeup: g.makeup,
            statusId: g.statusId,
            bDate: g.bDate || d.bDate,
            eDate: g.eDate || d.eDate,
            levelId: g.levelId || d.levelId,
            signup: g.signup || d.signup,
            subjectId: g.subjectId || d.subjectId,
            calendar: g.calendar?.length ? g.calendar : slotCalendar(s),
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
      const school = names.includes(s.school) ? s.school : "Прочее";
      const course = splitCourseAge(s.course || s.subject || s.groupName || "Без названия").name || "Без названия";
      const bag = map.get(school)!;
      if (!bag.has(course)) bag.set(course, []);
      bag.get(course)!.push(s);
    }
    return names
      .filter((school) => school !== "Прочее" || (map.get(school)?.size || 0) > 0)
      .map((school) => ({
        school,
        courses: [...(map.get(school)?.entries() || [])]
          .sort((a, b) => a[0].localeCompare(b[0], "ru"))
          .map(([course, items]) => ({ course, items })),
      }));
  }, [slots, branchFilter]);

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
    const last = t.split(" ").pop() || "";
    const word = last.toLowerCase().replace(/ё/g, "е").replace(/[^а-я]/g, "");
    const rest = t.slice(0, t.length - last.length).trim();
    const ready = /^(готов[аоыуе]?|гатов[аоыуе]?|готовоа)$/.test(word);
    const preview = /^(предпросмотр|превью)$/.test(word);
    const apply = /^(примен\w*|принять|опублик\w*)$/.test(word);
    const next = /^(дальше|далее|следующ\w*|сброс)$/.test(word);
    const cancel = /^(отмен\w*|сброс)$/.test(word);
    if (ready) return { body: rest, cmd: "готово" };
    if (preview) return { body: rest, cmd: "предпросмотр" };
    if (apply) return { body: rest, cmd: "применить" };
    if (cancel) return { body: rest, cmd: "отменить" };
    if (next) return { body: rest, cmd: "дальше" };
    if (/готов[аоыуе]?\s*$/i.test(t) && t.length <= 12) return { body: "", cmd: "готово" };
    return { body: t, cmd: "" };
  }

  function commitSpeech(raw: string) {
    const { body, cmd } = parseVoice(raw);
    lastFinalRef.current = raw;
    setInterim("");
    if (body) {
      setAiPrompt((p) => {
        const n = p ? `${p} ${body}` : body;
        promptRef.current = n;
        listenBaseRef.current = n;
        return n;
      });
      void absorbSpeech(body);
    }
    if (cmd) void runCmd(cmd);
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
    if (voiceModeRef.current) {
      window.setTimeout(() => {
        if (voiceModeRef.current && !speakingRef.current) startListen("loop");
      }, 280);
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
    if (extraBody) {
      setAiPrompt((p) => {
        const n = p ? `${p} ${extraBody}` : extraBody;
        promptRef.current = n;
        return n;
      });
      await absorbSpeech(extraBody);
    }
    if (cmd === "отменить") {
      cancelPreview();
      if (voiceModeRef.current) await say("Отменила предпросмотр.");
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
    rec.interimResults = true;
    rec.continuous = true;
    lastFinalRef.current = "";
    doneRef.current = 0;
    accRef.current = "";
    listenBaseRef.current = promptRef.current;
    rec.onresult = (e) => {
      if (pauseRef.current || speakingRef.current) return;
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
      setInterim(shown);
      window.clearTimeout(speechTimer.current);
      if (parseVoice(shown).cmd) {
        const raw = shown;
        accRef.current = "";
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
    void say("Голосовой мастер. Назовите курс и возраст, день, время, филиал и педагога. Если чего-то не хватит — спрошу. Команды: готово, применить, дальше.");
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
    <section className="mt-10 space-y-6">
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
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Последняя загрузка: {when(at)} · {slots.length} слотов · {dirty.size ? `${dirty.size} не выгружены в CRM` : "совпадает с кабинетом"}
        </p>
      </AdminSectionHead>

      <div className="flex gap-2">
        <Button type="button" size="sm" variant={pane === "groups" ? "primary" : "secondary"} onClick={() => setPane("groups")}>
          Группы
        </Button>
        <Button type="button" size="sm" variant={pane === "subjects" ? "primary" : "secondary"} onClick={() => setPane("subjects")}>
          Предметы
        </Button>
        <Button type="button" size="sm" variant={pane === "map" ? "primary" : "secondary"} onClick={() => setPane("map")}>
          Соответствия
        </Button>
      </div>

      {pane === "subjects" ? <AdminSubjects /> : null}
      {pane === "map" ? <AdminScheduleMap embedded /> : null}
      {pane === "groups" ? (
      <>
      <div className="flex flex-wrap items-start gap-2">
        <TipWrap text="Школа, курс, возраст, день, время, филиал, педагог — затем «Готово». Строка на сайте, в CRM — отдельной выгрузкой.">
          <Button type="button" disabled={busy} onClick={() => { setAddOpen((v) => !v); document.getElementById("ra-sched-ai")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            Добавить расписание
          </Button>
        </TipWrap>
        <TipWrap text="Подтягивает группы из AlfaCRM: новые добавляет, существующие обновляет. Страницы курсов и /schedule сразу показывают это расписание.">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void pullCrm()}>
            Загрузить из AlfaCRM
          </Button>
        </TipWrap>
        <TipWrap text="Пишет storage/crm-schedule.json. Посетитель видит новое расписание без выгрузки в CRM.">
          <Button type="button" variant="secondary" disabled={busy || !slots.length} onClick={async () => { const res = await run("save", { slots }); if (res.ok) setMsg("Сохранено на сайте. Страницы курсов обновятся сразу. В CRM — отдельной кнопкой."); }}>
            Сохранить на сайте
          </Button>
        </TipWrap>
        <TipWrap text="Только отмеченные чекбоксом. Сначала создаётся группа, потом регулярный урок с subject_id. Новый gid записывается в расписание.">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void pushCrm()}>
            Выгрузить в AlfaCRM
          </Button>
        </TipWrap>
        <div className="relative" ref={fileRef}>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setFileOpen((v) => !v)}>
            Файл
            <span className="text-[0.65rem]">▾</span>
          </Button>
          {fileOpen ? (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[13rem] rounded-2xl bg-white p-1 shadow-[var(--shadow-border)]">
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
            </div>
          ) : null}
        </div>
        <Button type="button" variant="secondary" onClick={() => setOpenAll((v) => !v)}>
          {openAll ? "Свернуть всё" : "Раскрыть всё"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !pickedIds.length}
          onClick={() => void removeSlots(pickedIds)}
        >
          Удалить выбранные{pickedIds.length ? ` · ${pickedIds.length}` : ""}
        </Button>
        <span className="ml-1 inline-flex items-center gap-3 text-[0.72rem] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-pink-400" /> не в AlfaCRM</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> в AlfaCRM</span>
        </span>
      </div>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <article id="ra-sched-ai" className="sticky top-20 z-20 rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="font-display text-xl">Добавить / исправить расписание</p>
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
          Стрелка — предпросмотр. Голосовые команды: <b>опубликовать</b>, <b>отменить</b>, <b>дальше</b>.
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
            value={interim ? [listenBaseRef.current, interim].filter(Boolean).join(" ") : aiPrompt}
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

      {addOpen ? (
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
      ) : null}

      {versions.length ? (
        <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Версии</p>
            <InfoTip text="Каждая загрузка из CRM, сохранение, импорт и ИИ-правка пишут снимок. Откат возвращает таблицу на сайте. В AlfaCRM само не откатится — после отката нажмите «Выгрузить в AlfaCRM»." />
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {versions.map((v) => (
              <li key={v.at} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {when(v.at)} · {v.reason} · {v.count} слотов
                </span>
                <button type="button" className="text-xs font-semibold text-primary" disabled={busy} onClick={async () => { await run("rollback", { at: v.at }); setDirty(new Set()); setMsg("Откатили снимок на сайте."); }}>
                  Откатить
                </button>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <div className="space-y-4">
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
                            <col className="w-8" />
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
                              return (
                              <Fragment key={s.id}>
                              <tr id={`ra-slot-${s.id}`} className={cn("border-t border-black/6", dirty.has(s.id) && "bg-primary/5", flash.has(s.id) && "ra-flash")}>
                                <td className="px-2 py-1.5 align-middle">
                                  <div className="flex items-center gap-1.5">
                                    <CheckBox ids={[s.id]} picked={picked} onToggle={setIds} />
                                    <CrmDot s={s} />
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    {s.groupId ? <span className="w-8 shrink-0 text-right text-[0.7rem] font-semibold tabular-nums text-muted">{s.groupId}</span> : <span className="w-8 shrink-0" />}
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
                                  <DetailsBtn on={detail?.id === s.id} onClick={() => void openDetail(s)} />
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <button type="button" title="Удалить из расписания" className="text-xs font-semibold text-muted hover:text-red-600" onClick={() => void removeSlots([s.id])}>
                                    ×
                                  </button>
                                </td>
                              </tr>
                              {detail?.id === s.id ? (
                                <tr key={`${s.id}-detail`}>
                                  <td colSpan={12} className="px-4 py-4" style={{ background: ADMIN_PANEL_BLUE }}>
                                    {detail.loading ? (
                                      <p className="text-sm text-muted">Загружаю настройки группы из AlfaCRM…</p>
                                    ) : (
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <GroupLessonStrip lessons={detail.calendar} />
                                        <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                                          Запись
                                          <a
                                            href={detail.signup || leadHref(s)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-1 flex h-10 items-center rounded-xl bg-white px-3 text-sm font-semibold normal-case tracking-normal text-primary ring-1 ring-black/8"
                                          >
                                            gid {s.groupId || "—"} · открыть форму
                                          </a>
                                        </label>
                                        <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                                          Предмет
                                          <select
                                            value={detail.subjectId || ""}
                                            onChange={(e) => setDetail((d) => (d ? { ...d, subjectId: Number(e.target.value) || 0 } : d))}
                                            className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8"
                                          >
                                            <option value="">— не выбран —</option>
                                            {subjects.map((sub) => (
                                              <option key={sub.id} value={sub.id}>
                                                {sub.name} · id {sub.id}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted md:col-span-2">
                                          Описание
                                          <input
                                            value={detail.description}
                                            onChange={(e) => setDetail((d) => (d ? { ...d, description: e.target.value } : d))}
                                            className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8"
                                          />
                                        </label>
                                        <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                                          Хэштеги
                                          <input
                                            value={detail.hashtags}
                                            onChange={(e) => setDetail((d) => (d ? { ...d, hashtags: e.target.value } : d))}
                                            className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8"
                                          />
                                        </label>
                                        <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                                          Примечания
                                          <input
                                            value={detail.remarks}
                                            onChange={(e) => setDetail((d) => (d ? { ...d, remarks: e.target.value } : d))}
                                            className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8"
                                          />
                                        </label>
                                        <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                                          Период обучения
                                          <span className="mt-1 flex h-10 items-center gap-2">
                                            <input
                                              value={detail.bDate}
                                              onChange={(e) => setDetail((d) => (d ? { ...d, bDate: e.target.value } : d))}
                                              placeholder="с"
                                              className="h-10 w-full rounded-xl bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8"
                                            />
                                            <span className="text-[0.7rem] font-medium normal-case text-muted">до</span>
                                            <input
                                              value={detail.eDate}
                                              onChange={(e) => setDetail((d) => (d ? { ...d, eDate: e.target.value } : d))}
                                              placeholder="до"
                                              className="h-10 w-full rounded-xl bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8"
                                            />
                                          </span>
                                        </label>
                                        <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                                          Уровень знаний
                                          <select
                                            value={detail.levelId || ""}
                                            onChange={(e) => setDetail((d) => (d ? { ...d, levelId: Number(e.target.value) || 0 } : d))}
                                            className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8"
                                          >
                                            <option value="">— не задан —</option>
                                            {levels.map((lv) => (
                                              <option key={lv.id} value={lv.id}>
                                                {lv.name}
                                              </option>
                                            ))}
                                            {detail.levelId && !levels.some((lv) => lv.id === detail.levelId) ? (
                                              <option value={detail.levelId}>Уровень {detail.levelId}</option>
                                            ) : null}
                                          </select>
                                        </label>
                                        <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                                          Статус
                                          <select
                                            value={detail.statusId || ""}
                                            onChange={(e) => setDetail((d) => (d ? { ...d, statusId: Number(e.target.value) || 0 } : d))}
                                            className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8"
                                          >
                                            <option value="">— не задан —</option>
                                            {GROUP_STATUS.map((st) => (
                                              <option key={st.id} value={st.id}>
                                                {st.name}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                                          Отработка
                                          <input
                                            value={detail.makeup}
                                            onChange={(e) => setDetail((d) => (d ? { ...d, makeup: e.target.value } : d))}
                                            className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8"
                                          />
                                        </label>
                                        <div className="flex items-end justify-end md:col-span-2">
                                          <Button type="button" disabled={detail.saving} onClick={() => void saveDetail()}>
                                            Сохранить в AlfaCRM
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ) : null}
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
      </>
      ) : null}
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
