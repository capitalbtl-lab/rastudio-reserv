"use client";

import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { createPortal } from "react-dom";
import { adminSchedule, type GroupMember, type CustomerCard } from "@/data/admin-schedule";
import { type CrmSlot } from "@/data/crm-slots-core";
import { Button } from "@/components/ui/button";
import { InfoTip, TipWrap, TIP_BOX } from "@/components/info-tip";
import { AdminSectionHead, AdminSelfTest, adminGhostBtn, type AdminSelfTestHandle } from "@/components/admin-self-test";
import { SCHOOLS, BRANCHES } from "@/data/site";
import { slotMismatch, mismatchHint } from "@/data/slot-mismatch";
import { cn } from "@/lib/utils";
import { speakAgent } from "@/data/agent-voice";
import { missingScheduleFields, beatsOf, type LessonBeat, matchBranch, defaultPeriod } from "@/data/crm-slots-core";
import { parseDraftFromSpeech } from "@/data/schedule-speech";
import { AdminSubjects } from "@/components/admin-subjects";
import { AdminCoursePrices } from "@/components/admin-course-prices";
import { AdminTariffs } from "@/components/admin-tariffs";
import { AdminScheduleMap } from "@/components/admin-schedule-map";
import { pullFromCrm } from "@/lib/crm-pull";
import { CrmPullDialog, emptyPull, type CrmPullState } from "@/components/crm-pull-dialog";
import type { CrmSubject } from "@/data/crm-subjects";
import { ADMIN_PANEL_BLUE, RA_POP } from "@/data/admin-ui";
import type { GroupCalLesson } from "@/data/crm-slots-core";
import type { CrmTeacher } from "@/data/crm-teachers";
import { AdminClients } from "@/components/admin-clients";
import { AdminCrmSettings } from "@/components/admin-crm-settings";
import { AdminPublicSite } from "@/components/admin-public-site";
import { CrmClientCard } from "@/components/crm-client-card";
import { CrmGroupMembers } from "@/components/crm-group-card";
import { RaSelect } from "@/components/ra-select";
import { GroupLessonStrip } from "@/components/lesson-strip";
import { clientCardId, groupCardId, CRM_BRANCH, groupAssignKey } from "@/data/ids";
import { displayPersonName } from "@/data/client-display";
import { GROUP_STATUSES, GROUP_PRIORITY, readPriority } from "@/data/group-status";
import { bulkPreviewFromPrompt } from "@/data/schedule-bulk";

type SiteTree = {
  schools: { id: string; label: string; href: string }[];
  courses: { id: string; schoolId: string; label: string; href: string; age: string }[];
  assign: Record<string, string>;
};
const EMPTY_TREE: SiteTree = { schools: [], courses: [], assign: {} };

function branchTwoLine(s: { branchId?: number; city?: string; branch?: string }) {
  const hit = CRM_BRANCH[Number(s.branchId) || 0];
  const city = (s.city || hit?.name.split(",")[0] || "").trim();
  const short = (hit?.short || s.branch || "").trim();
  if (city && short && !short.includes(city)) return `${city}\n${short}`;
  return short || city || "—";
}

function siteCourseValue(s: CrmSlot, tree: SiteTree) {
  const id = String(s.courseId || tree.assign?.[groupAssignKey(s)] || "");
  return tree.courses.some((c) => c.id === id) ? id : "";
}

function branchSubjectList(slots: CrmSlot[], branchId: number, list: CrmSubject[], exceptId = "") {
  const ids = new Set(
    slots.filter((x) => x.branchId === branchId && x.subjectId && x.id !== exceptId).map((x) => x.subjectId),
  );
  return list.filter((s) => ids.has(s.id));
}

function courseSubjectList(
  courseId: string,
  slots: CrmSlot[],
  list: (CrmSubject & { href?: string; courseId?: string })[],
) {
  if (!courseId) return [] as typeof list;
  const ids = new Set<number>();
  for (const s of list) {
    if (s.courseId === courseId) ids.add(s.id);
  }
  for (const s of slots) {
    if (s.courseId === courseId && s.subjectId) ids.add(s.subjectId);
  }
  return list.filter((s) => ids.has(s.id));
}

function subjectFitsCourse(slot: CrmSlot, sub?: CrmSubject | null) {
  if (!sub) return false;
  if (slot.subjectId) return slot.subjectId === sub.id;
  return false;
}

const GROUP_STATUS = GROUP_STATUSES.filter((s) => s.admin || s.id === 3);

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

const CARD_FIELDS = [
  { id: "remarks", label: "Примечания" },
  { id: "description", label: "Описание" },
  { id: "calendar", label: "Расписание занятий" },
  { id: "age", label: "Возраст" },
  { id: "day", label: "День" },
  { id: "period", label: "Период" },
  { id: "time", label: "Время" },
  { id: "week", label: "×нед" },
  { id: "places", label: "Места" },
  { id: "branch", label: "Филиал" },
  { id: "teacher", label: "Педагог" },
  { id: "tariff", label: "Абонемент" },
  { id: "hashtags", label: "Хэштеги" },
  { id: "course", label: "Курс на сайте" },
  { id: "subject", label: "Предмет" },
  { id: "signup", label: "Запись" },
  { id: "level", label: "Уровень" },
  { id: "status", label: "Статус" },
  { id: "priority", label: "Приоритет" },
  { id: "makeup", label: "Отработка" },
  { id: "members", label: "Ученики" },
  { id: "leads", label: "Лиды" },
  { id: "archive", label: "Архивные ученики" },
] as const;

const CARD_SEL =
  "mt-1 h-8 rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07]";

const DAYS_RU = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

const CARD_FIELDS_KEY = "ra_group_card_fields";

function readCardFields(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CARD_FIELDS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
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
  courseId?: string;
  schoolId?: string;
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

const SILENCE = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

function speakBrowser(text: string) {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const syn = window.speechSynthesis;
    if (!syn || !text.trim()) {
      finish();
      return;
    }
    syn.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    u.rate = 1.06;
    const voices = syn.getVoices();
    const ru =
      voices.find((v) => /ru/i.test(v.lang) && /female|anna|milena|irina|alena|oksana/i.test(v.name)) ||
      voices.find((v) => /ru/i.test(v.lang));
    if (ru) u.voice = ru;
    u.onend = finish;
    u.onerror = finish;
    syn.speak(u);
    window.setTimeout(finish, Math.min(12000, 800 + text.length * 70));
  });
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
  return /лимит|мест|групп|дет|человек|возраст|день|время|педагог|филиал|курс|приоритет|поставь|поменяй|измени|сделай|максимум|минимум|\d/.test(w);
}

function localLimitPreview(prompt: string, slots: CrmSlot[], selectedIds: string[]) {
  return bulkPreviewFromPrompt(prompt, slots, selectedIds);
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
  return Number(s.groupId) > 0;
}

function DetailsBtn({ on, onClick, busy }: { on?: boolean; onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      title={on ? "Свернуть карточку" : "Открыть карточку группы"}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={cn(
        "relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-medium leading-none transition-colors",
        on ? "bg-primary text-white" : "bg-[#c5ccd6] text-[#3f4854] hover:bg-[#b4bcc8]",
      )}
    >
      {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-fg/20 border-t-fg" /> : on ? "−" : "+"}
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
  saving: boolean;
  error?: string;
  slot: CrmSlot;
  tariffId: number;
  tariffs: { id: number; name: string; price: number; lessonsCount: number; duration: number; fit?: boolean }[];
  priority: number;
};

function GroupNameField({ value, onChange, subject, large }: { value: string; onChange: (v: string) => void; subject?: string; large?: boolean }) {
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
    probe.style.cssText = large
      ? "position:absolute;left:-9999px;white-space:nowrap;font-size:0.85rem;padding:0 8px"
      : "position:absolute;left:-9999px;white-space:nowrap;font-size:0.8rem;padding:0 8px";
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
        className={cn(
          "w-full rounded-md bg-surface-2 px-2 ring-1 ring-black/8",
          large ? "h-8 text-[0.85rem]" : "h-8 text-[0.82rem]",
        )}
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
              className={cn(
                "fixed z-[75] rounded-md bg-white px-2 shadow-[0_8px_28px_rgba(15,23,42,0.22)] ring-1 ring-black/20 transition-opacity duration-300",
                large ? "text-[0.92rem]" : "text-[0.8rem]",
              )}
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
  const rawBeats = beatsOf(s);
  const beats = rawBeats.filter((b) => b.lessonId || /^\d{1,2}:\d{2}$/.test(b.timeFrom || ""));
  const list = beats.length ? beats : rawBeats;
  const n = Math.max(1, list.length);
  const i = ((index % n) + n) % n;
  const plus = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const first = list[0] || { day: 1, timeFrom: "18:00", timeTo: "19:30", lessonId: 0 };
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
        title={n > 1 ? `${n} занятия в неделю. Сейчас день ${i + 1}. Нажмите, чтобы показать другой.` : "Одно занятие в неделю"}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[0.75rem] font-semibold ring-1 ring-black/8"
        onClick={() => {
          if (n > 1) onView((i + 1) % n);
        }}
      >
        {n}
      </button>
      {list.length < 3 ? (
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
              className={cn("fixed z-[220] w-[15rem] p-3.5 text-fg", RA_POP)}
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
      className="h-[13px] w-[13px] shrink-0 accent-primary"
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
        className="inline-flex h-8 w-full min-w-[5.6rem] cursor-default items-center justify-center rounded-full bg-surface-2 px-2 text-center text-[0.8rem] text-muted ring-1 ring-black/8"
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

export function AdminSchedule() {
  const [slots, setSlots] = useState<CrmSlot[]>([]);
  const [at, setAt] = useState("");
  const [pullN, setPullN] = useState(30);
  const [pullUnit, setPullUnit] = useState<"min" | "hour" | "day" | "week">("min");
  const [nextPullAt, setNextPullAt] = useState("");
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
  const [pickedSchools, setPickedSchools] = useState<Record<string, boolean>>({});
  const [pickedCourses, setPickedCourses] = useState<Record<string, boolean>>({});
  const [who, setWho] = useState<Record<string, string[]>>({});
  const whoRef = useRef<Record<string, string[]>>({});
  const whoPending = useRef<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"school" | "course" | "group">("group");
  const [createSchool, setCreateSchool] = useState("");
  const [createCourse, setCreateCourse] = useState({ name: "", age: "" });
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [listen, setListen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [interim, setInterim] = useState("");
  const [wizard, setWizard] = useState<Draft>(EMPTY_WIZARD);
  const [ask, setAsk] = useState("");
  const recRef = useRef<Rec | null>(null);
  const ttsRef = useRef<HTMLAudioElement | null>(null);
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
  const [pull, setPull] = useState<CrmPullState>(emptyPull("groups"));
  const [pane, setPane] = useState<"groups" | "clients" | "subjects" | "prices" | "tariffs" | "map" | "crm" | "public">("groups");
  const [seen, setSeen] = useState({ groups: true, clients: false, subjects: false, prices: false, tariffs: false, map: false, crm: false, public: false });
  function showPane(id: typeof pane) {
    setPane(id);
    setSeen((s) => (s[id] ? s : { ...s, [id]: true }));
  }
  const [groupsWide, setGroupsWide] = useState(false);
  const [branchFilter, setBranchFilter] = useState("all");
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [siteTree, setSiteTree] = useState<SiteTree>(EMPTY_TREE);
  const [crmTeachers, setCrmTeachers] = useState<CrmTeacher[]>([]);
  const [dragId, setDragId] = useState("");
  const [pushUi, setPushUi] = useState({ open: false, step: "", done: false, created: 0, pushed: 0, failed: 0, error: "", lines: [] as string[] });
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [openingId, setOpeningId] = useState("");
  const openingRef = useRef("");
  const [pupil, setPupil] = useState<CustomerCard | null>(null);
  const [pupilLoading, setPupilLoading] = useState(false);
  const [addPupil, setAddPupil] = useState(false);
  const [addQ, setAddQ] = useState("");
  const [addHits, setAddHits] = useState<{ crmId: number; branchId: number; child: string; parent: string; phone: string; age: number | null; status: string }[]>([]);
  const [addForm, setAddForm] = useState({ name: "", parent: "", phone: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [memberBusy, setMemberBusy] = useState(0);
  const [cardFields, setCardFields] = useState<Record<string, boolean>>(readCardFields);
  const [nameEdit, setNameEdit] = useState(false);
  const [subjects, setSubjects] = useState<CrmSubject[]>([]);
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [levels, setLevels] = useState<{ id: number; name: string }[]>(SEED_LEVELS);
  const fileRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const versionsRef = useRef<HTMLDivElement>(null);
  const versionsMenuRef = useRef<HTMLDivElement>(null);
  const promptEl = useRef<HTMLTextAreaElement>(null);
  const closeGuard = useRef(0);
  const checkRef = useRef<AdminSelfTestHandle>(null);

  useEffect(() => {
    if (!groupsWide) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGroupsWide(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [groupsWide]);

  function take(res: {
    ok: boolean;
    slots?: CrmSlot[];
    at?: string;
    versions?: Ver[];
    error?: string;
    comment?: string;
    changes?: Change[];
    adds?: Draft[];
    pushed?: number;
    created?: string[];
    applied?: string[];
    pullN?: number;
    pullUnit?: "min" | "hour" | "day" | "week";
    nextPullAt?: string;
    tree?: SiteTree;
    teachers?: CrmTeacher[];
  }) {
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return;
    }
    if (res.slots) setSlots(res.slots);
    if (res.at) setAt(res.at);
    if (res.versions) setVersions(res.versions);
    if (res.tree) setSiteTree(res.tree);
    if (res.teachers) setCrmTeachers(res.teachers);
    if (res.pullN) setPullN(res.pullN);
    if (res.pullUnit) setPullUnit(res.pullUnit);
    if (res.nextPullAt !== undefined) setNextPullAt(res.nextPullAt || "");
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
    try {
      const res = await adminSchedule({ data: { token: token(), action, ...extra } as never });
      take(res as never);
      return res;
    } catch (e) {
      const error = e instanceof Error ? e.message : "Ошибка запроса";
      setMsg(error);
      return { ok: false as const, error };
    } finally {
      setBusy(false);
    }
  }

  async function savePull(n: number, unit: "min" | "hour" | "day" | "week") {
    const res = await adminSchedule({ data: { token: token(), action: "saveSettings", pullN: n, pullUnit: unit } });
    take(res as never);
    if (res.ok) setMsg("Настройка сохранена. Автозагрузка выключена — данные читаются с сайта.");
  }

  useEffect(() => {
    void run("get");
    void adminSchedule({ data: { token: token(), action: "subjectsGet" } as never }).then((res) => {
      if (res.ok && "subjects" in res && Array.isArray(res.subjects)) setSubjects(res.subjects as CrmSubject[]);
    });
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
    if (!addPupil) return;
    const q = addQ.trim();
    if (q.length < 2) {
      setAddHits([]);
      return;
    }
    const branchId = detail?.branchId || 0;
    const inGroup = new Set((detail?.members || []).map((m) => m.id).concat((detail?.archive || []).map((m) => m.id)));
    const handle = window.setTimeout(() => {
      void adminSchedule({ data: { token: token(), action: "customersSearch", q, branchId } as never }).then((res) => {
        if (!res.ok || !("items" in res) || !Array.isArray(res.items)) return;
        setAddHits(
          (res.items as { crmId?: number; branchId?: number; child?: string; parent?: string; phone?: string; age?: number | null; status?: string }[])
            .map((x) => ({
              crmId: Number(x.crmId || 0),
              branchId: Number(x.branchId || 0),
              child: String(x.child || ""),
              parent: String(x.parent || ""),
              phone: String(x.phone || ""),
              age: x.age ?? null,
              status: String(x.status || ""),
            }))
            .filter((x) => x.crmId && !inGroup.has(x.crmId))
            .slice(0, 8),
        );
      });
    }, 280);
    return () => window.clearTimeout(handle);
  }, [addQ, addPupil, detail?.branchId, detail?.members, detail?.archive]);
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
    const apply = (s: CrmSlot) => {
      const next = { ...s, [field]: value };
      if (field === "day") next.dayLabel = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][Number(value)] || s.dayLabel;
      return next;
    };
    setSlots((list) => list.map((s) => (s.id !== id ? s : apply(s))));
    setDirty((d) => new Set(d).add(id));
    setDetail((d) => (d && d.id === id ? { ...d, slot: apply(d.slot) } : d));
  }

  async function patchFlags(s: CrmSlot, field: "statusId" | "priority", value: number) {
    setSlots((list) => list.map((row) => (row.id === s.id ? { ...row, [field]: value } : row)));
    if (detail?.id === s.id) setDetail((d) => (d ? { ...d, [field]: value } : d));
    if (!s.groupId) {
      setDirty((d) => new Set(d).add(s.id));
      return;
    }
    const res = (await adminSchedule({
      data: {
        token: token(),
        action: "groupFlags",
        groupId: s.groupId,
        branchId: s.branchId,
        statusId: field === "statusId" ? value : s.statusId,
        priority: field === "priority" ? value : s.priority,
      } as never,
    })) as { ok?: boolean; error?: string };
    if (!res.ok) {
      setDirty((d) => new Set(d).add(s.id));
      setMsg(res.error || "Статус не записался в AlfaCRM.");
    }
  }

  async function openDetail(s: CrmSlot) {
    if (detail?.id === s.id) {
      setDetail(null);
      setPupil(null);
      setOpeningId("");
      openingRef.current = "";
      return;
    }
    closeGuard.current = Date.now() + 800;
    setPupil(null);
    setOpeningId(s.id);
    openingRef.current = s.id;
    const still = () => openingRef.current === s.id;
    const period = defaultPeriod(s.bDate, s.eDate);
    const base = (): GroupDetail => ({
      id: s.id,
      groupId: s.groupId,
      branchId: s.branchId,
      description: s.description || s.groupNote || "",
      remarks: s.remarks || "",
      hashtags: (s.hashtags || "").replace(/\s+/g, " ").trim(),
      makeup: s.makeup || "",
      statusId: s.statusId || 0,
      bDate: s.bDate || period.bDate,
      eDate: s.eDate || period.eDate,
      levelId: s.levelId || 0,
      signup: leadHref(s),
      subjectId: s.subjectId || 0,
      calendar: [],
      members: [],
      archive: [],
      saving: false,
      slot: s,
      tariffId: s.tariffId || 0,
      tariffs: [],
      priority: readPriority(s.priority),
    });
    setDetail(base());
    setMsg(`Карточка группы ${s.groupId || ""}`);
    try {
      if (!s.groupId) {
        const sub = await adminSchedule({ data: { token: token(), action: "subjectsGet" } as never });
        if (sub.ok && "subjects" in sub && Array.isArray(sub.subjects)) {
          setSubjects(sub.subjects as CrmSubject[]);
        }
        return;
      }
      const [res, people] = await Promise.all([
        adminSchedule({ data: { token: token(), action: "groupGet", groupId: s.groupId, branchId: s.branchId } as never }),
        adminSchedule({ data: { token: token(), action: "groupMembers", groupId: s.groupId, branchId: s.branchId } as never }),
      ]);
      if (!still()) return;
      if (!res.ok) {
        setMsg(res.error || "Карточка с сайта. AlfaCRM не ответила — данные группы можно править здесь.");
        return;
      }
      if ("subjects" in res && Array.isArray(res.subjects)) setSubjects(res.subjects as CrmSubject[]);
      if ("teachers" in res && Array.isArray((res as { teachers?: CrmTeacher[] }).teachers) && (res as { teachers: CrmTeacher[] }).teachers.length) {
        const incoming = (res as { teachers: CrmTeacher[] }).teachers;
        setCrmTeachers((prev) => {
          const map = new Map(prev.map((t) => [t.id, { ...t, branchIds: [...(t.branchIds || [])] }]));
          for (const t of incoming) {
            const hit = map.get(t.id);
            if (hit) {
              if (t.name) hit.name = t.name;
              for (const b of t.branchIds || []) if (!hit.branchIds.includes(b)) hit.branchIds.push(b);
            } else map.set(t.id, { id: t.id, name: t.name, branchIds: [...(t.branchIds || [])] });
          }
          return [...map.values()];
        });
      }
      if ("levels" in res && Array.isArray((res as { levels?: { id: number; name: string }[] }).levels) && (res as { levels: { id: number; name: string }[] }).levels.length) {
        setLevels((res as { levels: { id: number; name: string }[] }).levels);
      }
      const g = "group" in res && res.group
        ? (res.group as {
            note: string;
            description?: string;
            remarks?: string;
            hashtags: string;
            makeup: string;
            statusId: number;
            signup: string;
            subjectId?: number;
            bDate?: string;
            eDate?: string;
            levelId?: number;
            calendar?: GroupCalLesson[];
            priority?: number;
          })
        : null;
      const active = people.ok && "active" in people ? ((people.active || []) as GroupMember[]) : [];
      const archive = people.ok && "archive" in people ? ((people.archive || []) as GroupMember[]) : [];
      const next: GroupDetail = {
        ...base(),
        description: g?.description || g?.note || s.description || s.groupNote || "",
        remarks: g?.remarks || s.remarks || "",
        hashtags: ((g?.hashtags || s.hashtags || "").replace(/\s+/g, " ").trim()),
        makeup: g?.makeup || s.makeup || "",
        statusId: g?.statusId || s.statusId || 0,
        bDate: g?.bDate || s.bDate || period.bDate,
        eDate: g?.eDate || s.eDate || period.eDate,
        levelId: g?.levelId || s.levelId || 0,
        signup: g?.signup || leadHref(s),
        subjectId: g?.subjectId || s.subjectId || 0,
        calendar: g?.calendar?.length ? g.calendar : [],
        members: active,
        archive,
        tariffId: Number((res as { tariffId?: number }).tariffId) || s.tariffId || 0,
        tariffs: "tariffs" in res && Array.isArray(res.tariffs) ? (res.tariffs as GroupDetail["tariffs"]) : [],
        priority: readPriority(g?.priority ?? s.priority),
      };
      setDetail(next);
      setSlots((list) =>
        list.map((row) =>
          row.id === s.id
            ? {
                ...row,
                taken: active.length,
                takenStudy: active.filter((m) => m.status !== "лид").length,
                takenLead: active.filter((m) => m.status === "лид").length,
                priority: next.priority,
                statusId: next.statusId || row.statusId,
                subjectId: next.subjectId || row.subjectId,
                subject: subjects.find((x) => x.id === next.subjectId)?.name || row.subject,
              }
            : row,
        ),
      );
      if (active.length) {
        const key = `${s.branchId}-${s.groupId}`;
        const names = active.map((m) => m.name);
        whoRef.current = { ...whoRef.current, [key]: names };
        setWho((w) => ({ ...w, [key]: names }));
      }
    } catch {
      if (still()) setMsg("Карточка открыта по данным сайта. AlfaCRM не ответила.");
    } finally {
      if (still()) {
        setOpeningId("");
        openingRef.current = "";
      }
    }
  }

  async function openPupil(m: Pick<GroupMember, "id" | "name" | "parent" | "dob" | "age" | "gender" | "phones" | "status"> & { email?: string; to?: string }, branchId: number) {
    const branch = branchId || 1;
    setPupilLoading(true);
    setPupil({
      id: m.id,
      cardId: clientCardId(m.id),
      branchId: branch,
      name: displayPersonName(m.name, m.parent, m.phones?.[0]),
      parent: m.parent,
      dob: m.dob,
      age: m.age,
      gender: m.gender,
      phones: m.phones || [],
      emails: m.email ? [m.email] : [],
      address: "",
      status: m.status,
      note: "",
      paidTill: m.to || "",
      url: `https://studiyarazvivaysya.s20.online/company/${branch}/customer/view?id=${m.id}`,
      schools: [],
      groups: [],
      comms: [],
    });
    const res = await adminSchedule({ data: { token: token(), action: "customerGet", customerId: m.id, branchId: branch } as never });
    setPupilLoading(false);
    if (res.ok && "customer" in res && res.customer) {
      const next = res.customer as CustomerCard;
      setPupil((prev) => ({
        ...next,
        name: next.name || prev?.name || "",
        parent: next.parent || prev?.parent || "",
        dob: next.dob || prev?.dob || "",
        age: next.age || prev?.age || "",
        gender: next.gender || prev?.gender || "",
        phones: next.phones.length ? next.phones : prev?.phones || [],
        emails: next.emails.length ? next.emails : prev?.emails || [],
        status: next.status || prev?.status || "",
        schools: next.schools?.length ? next.schools : prev?.schools || [],
        groups: next.groups?.length ? next.groups : prev?.groups || [],
        studyStatus: next.studyStatus || prev?.studyStatus || "",
      }));
    }
  }

  async function openPupilById(crmId: number, branchId: number) {
    if (!crmId) return;
    await openPupil({ id: crmId, name: "", parent: "", dob: "", age: "", gender: "", phones: [], status: "" }, branchId);
  }

  async function mutatePupil(action: "customerSave" | "customerLesson" | "customerPay" | "customerTariff" | "customerGroup", extra: Record<string, unknown> = {}) {
    if (!pupil) return;
    const res = await adminSchedule({
      data: { token: token(), action, customerId: pupil.id, branchId: pupil.branchId, ...extra } as never,
    });
    if (!res.ok) throw new Error(("error" in res && res.error) || "AlfaCRM не приняла изменение.");
    if ("customer" in res && res.customer) setPupil(res.customer as CustomerCard);
  }

  function resetAddPupil() {
    setAddPupil(false);
    setAddQ("");
    setAddHits([]);
    setAddForm({ name: "", parent: "", phone: "" });
    setAddBusy(false);
    setAddErr("");
    setMemberBusy(0);
  }

  function showField(id: string) {
    return cardFields[id] !== false;
  }

  function toggleCardField(id: string) {
    setCardFields((prev) => {
      const next = { ...prev, [id]: prev[id] === false };
      try {
        localStorage.setItem(CARD_FIELDS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function showAllCardFields() {
    const next: Record<string, boolean> = {};
    for (const f of CARD_FIELDS) next[f.id] = true;
    setCardFields(next);
    try {
      localStorage.setItem(CARD_FIELDS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function applyMembers(slotId: string, active: GroupMember[], archive: GroupMember[]) {
    setDetail((d) => (d && d.id === slotId ? { ...d, members: active, archive } : d));
    setSlots((list) =>
      list.map((row) =>
        row.id === slotId
          ? {
              ...row,
              taken: active.length,
              takenStudy: active.filter((m) => m.status !== "лид").length,
              takenLead: active.filter((m) => m.status === "лид").length,
            }
          : row,
      ),
    );
  }

  async function reloadMembers() {
    if (!detail?.groupId) return;
    const slotId = detail.id;
    const res = await adminSchedule({ data: { token: token(), action: "groupMembers", groupId: detail.groupId, branchId: detail.branchId } as never });
    if (res.ok && "active" in res) {
      applyMembers(slotId, (res.active || []) as GroupMember[], (res.archive || []) as GroupMember[]);
    }
  }

  async function attachPupil(customerId: number, branchId: number) {
    if (!detail?.groupId) {
      setAddErr("Сначала сохраните группу в AlfaCRM.");
      return;
    }
    setAddBusy(true);
    setAddErr("");
    const res = await adminSchedule({
      data: {
        token: token(),
        action: "customerGroup",
        customerId,
        groupId: detail.groupId,
        branchId: branchId || detail.branchId,
        bDate: detail.bDate,
        eDate: detail.eDate,
      } as never,
    });
    setAddBusy(false);
    if (!res.ok) {
      setAddErr(("error" in res && res.error) || "Не удалось добавить ученика.");
      return;
    }
    resetAddPupil();
    await reloadMembers();
  }

  async function createAndAttach() {
    const name = addForm.name.trim();
    if (!name) {
      setAddErr("Укажите имя ученика.");
      return;
    }
    if (!detail?.groupId) {
      setAddErr("Сначала сохраните группу в AlfaCRM.");
      return;
    }
    setAddBusy(true);
    setAddErr("");
    const res = await adminSchedule({
      data: {
        token: token(),
        action: "customerCreate",
        name,
        parent: addForm.parent.trim(),
        phone: addForm.phone.trim(),
        branchId: detail.branchId,
        groupId: detail.groupId,
        bDate: detail.bDate,
        eDate: detail.eDate,
      } as never,
    });
    setAddBusy(false);
    if (!res.ok) {
      setAddErr(("error" in res && res.error) || "Не удалось записать ученика.");
      return;
    }
    resetAddPupil();
    await reloadMembers();
  }

  async function removePupil(m: GroupMember) {
    if (!detail?.groupId) return;
    const title = displayPersonName(m.name, m.parent, m.phone);
    if (!window.confirm(`Снять «${title}» с группы? Карточка в AlfaCRM останется.`)) return;
    setMemberBusy(m.id);
    const res = await adminSchedule({
      data: { token: token(), action: "customerGroup", customerId: m.id, groupId: detail.groupId, branchId: detail.branchId, remove: true } as never,
    });
    setMemberBusy(0);
    if (!res.ok) {
      setDetail((d) => (d ? { ...d, error: ("error" in res && res.error) || "Не удалось снять с группы." } : d));
      return;
    }
    await reloadMembers();
  }

  function openGroupFromLink(gid: number, branchId: number) {
    const s = slots.find((x) => x.groupId === gid && x.branchId === branchId) || slots.find((x) => x.groupId === gid);
    if (!s) {
      setMsg("Группа есть у клиента, но её нет в расписании на сайте. Загрузите расписание из AlfaCRM.");
      return;
    }
    setPupil(null);
    void openDetail(s);
  }

  async function createSubjectForBranch() {
    if (!detail) return;
    const courseId = siteCourseValue(detail.slot, siteTree);
    const course = siteTree.courses.find((c) => c.id === courseId);
    const name = course?.label || "";
    if (!courseId || !name) {
      setDetail((d) => (d ? { ...d, error: "Нет courseId — выберите курс сайта, не создавайте предмет по имени группы." } : d));
      return;
    }
    setCreatingSubject(true);
    setDetail((d) => (d ? { ...d, error: "" } : d));
    try {
      const res = await adminSchedule({
        data: { token: token(), action: "subjectCreate", name, branchId: detail.branchId, courseId, subjectId: detail.subjectId } as never,
      });
      if (res.ok && "subjects" in res && Array.isArray(res.subjects)) setSubjects(res.subjects as CrmSubject[]);
      const created = res.ok && "created" in res ? (res as { created?: { id?: number; name?: string } }).created : undefined;
      if (created?.id) {
        setDetail((d) => (d ? { ...d, subjectId: Number(created.id), error: "" } : d));
        setMsg(`Предмет «${created.name}» создан в AlfaCRM и включён`);
      } else {
        setDetail((d) => (d ? { ...d, error: (!res.ok && res.error) || "AlfaCRM не создала предмет. Повторите." } : d));
      }
    } catch (e) {
      setDetail((d) => (d ? { ...d, error: e instanceof Error ? e.message : "Не удалось создать предмет." } : d));
    } finally {
      setCreatingSubject(false);
    }
  }

  function slotFromDetail(d: GroupDetail): CrmSlot {
    return {
      ...d.slot,
      subjectId: d.subjectId,
      statusId: d.statusId,
      priority: d.priority,
      tariffId: d.tariffId,
      description: d.description,
      groupNote: d.description,
      remarks: d.remarks,
      hashtags: d.hashtags,
      makeup: d.makeup,
      bDate: d.bDate,
      eDate: d.eDate,
      levelId: d.levelId,
      signup: d.signup || d.slot.signup,
      branchId: d.branchId || d.slot.branchId,
    };
  }

  async function saveDetail() {
    if (!detail) return;
    setDetail((d) => (d ? { ...d, saving: true, error: "" } : d));
    const slot = slotFromDetail(detail);
    const nextSlots = slots.map((s) => (s.id === slot.id ? slot : s));
    const site = await adminSchedule({ data: { token: token(), action: "save", slots: nextSlots } as never });
    take(site as never);
    if (!site.ok) {
      setDetail((d) => (d ? { ...d, saving: false, error: site.error || "Не сохранилось на сайте." } : d));
      return;
    }
    const res = await adminSchedule({
      data: {
        token: token(),
        action: "groupSave",
        ids: [detail.id],
        groupId: detail.groupId,
        branchId: detail.branchId,
        groupName: detail.slot.groupName,
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
        tariffId: detail.tariffId,
        priority: detail.priority,
        limit: detail.slot.limit,
        age: detail.slot.age,
        teacher: detail.slot.teacher,
        teacherId: detail.slot.teacherId,
        teacherIds: detail.slot.teacherIds,
      } as never,
    });
    take(res as never);
    if (!res.ok) {
      setDetail((d) => (d ? { ...d, saving: false, error: res.error || "AlfaCRM не приняла группу." } : d));
      setMsg(res.error || "AlfaCRM не приняла группу.");
      return;
    }
    const extra = res as { groupId?: number; slots?: CrmSlot[]; queued?: boolean; local?: boolean; error?: string };
    const gid = Number(extra.groupId || detail.groupId || 0);
    const nextSlot = (extra.slots || []).find((s) => s.id === detail.id);
    const period = defaultPeriod(nextSlot?.bDate || detail.bDate, nextSlot?.eDate || detail.eDate);
    const warn = String(extra.error || "");
    setDetail((d) =>
      d
        ? {
            ...d,
            saving: false,
            error: warn,
            groupId: gid || d.groupId,
            slot: nextSlot || d.slot,
            subjectId: nextSlot?.subjectId || d.subjectId,
            tariffId: nextSlot?.tariffId ?? d.tariffId,
            signup: nextSlot?.signup || d.signup,
            bDate: nextSlot?.bDate || d.bDate || period.bDate,
            eDate: nextSlot?.eDate || d.eDate || period.eDate,
          }
        : d,
    );
    setMsg(
      warn
        ? warn
        : extra.local || extra.queued
          ? detail.groupId
            ? "На сайте, AlfaCRM в очереди."
            : "На сайте, создание группы в очереди AlfaCRM."
          : detail.groupId
            ? "Подробности группы сохранены в AlfaCRM."
            : `Группа создана в AlfaCRM · gid ${gid}.`,
    );
  }

  async function saveDetailSite() {
    if (!detail) return;
    setDetail((d) => (d ? { ...d, saving: true, error: "" } : d));
    let slot = slotFromDetail(detail);
    let list = slots;
    if (slot.courseId) {
      const moved = await adminSchedule({
        data: { token: token(), action: "treeMove", ids: [slot.id], courseId: slot.courseId } as never,
      });
      take(moved as never);
      if (moved.ok && "slots" in moved && Array.isArray(moved.slots)) list = moved.slots as CrmSlot[];
    }
    const next = list.map((s) => (s.id === slot.id ? { ...s, ...slot, courseId: slot.courseId || s.courseId } : s));
    const res = await adminSchedule({ data: { token: token(), action: "save", slots: next } as never });
    take(res as never);
    if (!res.ok) {
      setDetail((d) => (d ? { ...d, saving: false, error: res.error || "Не сохранилось на сайте." } : d));
      setMsg(res.error || "Не сохранилось на сайте.");
      return;
    }
    const saved = ((res as { slots?: CrmSlot[] }).slots || next).find((s) => s.id === slot.id) || slot;
    setDirty((d) => {
      const n = new Set(d);
      n.delete(slot.id);
      return n;
    });
    setDetail((d) => (d ? { ...d, saving: false, slot: saved, error: "" } : d));
    setMsg("Группа сохранена на сайте. В AlfaCRM — отдельной кнопкой.");
  }

  function shownBeat(s: CrmSlot) {
    const raw = beatsOf(s);
    const beats = raw.filter((b) => b.lessonId || /^\d{1,2}:\d{2}$/.test(b.timeFrom || ""));
    const list = beats.length ? beats : raw;
    const i = view[s.id] || 0;
    return list[((i % list.length) + list.length) % list.length] || list[0];
  }

  function patchBeat(s: CrmSlot, field: "day" | "timeFrom" | "timeTo", value: string | number) {
    const beats = beatsOf(s);
    const i = view[s.id] || 0;
    const next = beats.map((b, n) => (n === i ? { ...b, [field]: value } : b));
    const cur = next[i];
    const apply = (row: CrmSlot) =>
      row.id !== s.id
        ? row
        : {
            ...row,
            beats: next,
            timesPerWeek: next.length,
            day: i === 0 ? Number(cur.day) : row.day,
            dayLabel: i === 0 ? ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][Number(cur.day)] || row.dayLabel : row.dayLabel,
            timeFrom: i === 0 ? cur.timeFrom : row.timeFrom,
            timeTo: i === 0 ? cur.timeTo : row.timeTo,
          };
    setSlots((list) => list.map(apply));
    setDirty((d) => new Set(d).add(s.id));
    setDetail((d) => (d && d.id === s.id ? { ...d, slot: apply(d.slot) } : d));
  }

  function addBeat(s: CrmSlot, b: LessonBeat) {
    const beats = [...beatsOf(s), b];
    const apply = (row: CrmSlot) => (row.id === s.id ? { ...row, beats, timesPerWeek: beats.length } : row);
    setSlots((list) => list.map(apply));
    setView((v) => ({ ...v, [s.id]: beats.length - 1 }));
    setDirty((d) => new Set(d).add(s.id));
    setDetail((d) => (d && d.id === s.id ? { ...d, slot: apply(d.slot) } : d));
  }

  const tree = useMemo(() => {
    const schools = siteTree.schools.length
      ? siteTree.schools
      : SCHOOLS.map((s) => ({ id: s.href, label: s.label, href: s.href }));
    const filtered: CrmSlot[] = [];
    for (const s of slots) {
      if (branchFilter !== "all") {
        const key = s.branchId ? String(s.branchId) : `x-${s.city}|${s.branch}`;
        if (key !== branchFilter) continue;
      }
      if (onlyMismatch && !slotMismatch(s).level) continue;
      filtered.push(s);
    }
    const used = new Set<string>();
    const ageLo = (s: string) => {
      const m = String(s || "").match(/(\d{1,2})/);
      return m ? Number(m[1]) : 99;
    };
    const rows = schools.map((school) => {
      const list = siteTree.courses
        .filter((c) => c.schoolId === school.id)
        .slice()
        .sort((a, b) => ageLo(a.age || a.label) - ageLo(b.age || b.label) || a.label.localeCompare(b.label, "ru"));
      const courses = list.map((c) => ({ course: c.label, courseId: c.id, href: c.href, items: [] as CrmSlot[] }));
      for (const s of filtered) {
        if (used.has(s.id)) continue;
        const key = Number(s.groupId) > 0 ? `gid:${Number(s.branchId) || 0}:${s.groupId}` : s.id;
        const cid = (s.courseId || siteTree.assign?.[key] || "") as string;
        const byHit = courses.find((c) => c.courseId && c.courseId === cid);
        if (byHit) {
          byHit.items.push(s);
          used.add(s.id);
        }
      }
      const loose = filtered.filter((s) => s.schoolId === school.id && !used.has(s.id));
      if (loose.length) {
        loose.forEach((s) => used.add(s.id));
        courses.push({ course: "Без курса", courseId: `${school.id}#loose`, href: "", items: loose });
      }
      return { school: school.label, schoolId: school.id, courses };
    });
    const orphan = filtered.filter((s) => !used.has(s.id));
    if (orphan.length) {
      rows.unshift({
        school: "Без курса сайта",
        schoolId: "other",
        courses: [{ course: "Без курса", courseId: "other#loose", href: "", items: orphan }],
      });
    }
    if (onlyMismatch) {
      return rows
        .map((sch) => ({ ...sch, courses: sch.courses.filter((c) => c.items.length) }))
        .filter((sch) => sch.courses.length);
    }
    return rows;
  }, [slots, branchFilter, onlyMismatch, siteTree]);

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

  useEffect(() => {
    if (!onlyMismatch) return;
    const t = window.setTimeout(() => {
      const first = mismatchCount.ids[0];
      const el = (first && document.getElementById(`ra-slot-${first}`)) || document.getElementById("ra-mismatch-list");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [onlyMismatch, tree.length, mismatchCount.ids]);

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
      : tree.flatMap((s) => s.courses).find((c) => c.courseId === openCourse)?.items || [];
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

  async function applyPriorityNow(comment: string, changes: Change[], viaVoice: boolean) {
    setAiComment(comment);
    setAiChanges(changes);
    setAiAdds([]);
    changesRef.current = changes;
    addsRef.current = [];
    setMsg(comment);
    if (!changes.length) {
      if (viaVoice) await say(comment);
      return;
    }
    await applyPreview();
    const done = `${comment} Записала в AlfaCRM.`;
    setMsg(done);
    if (viaVoice) await say(done);
  }

  const DAYS_SHORT = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const previewOn = aiAdds.length > 0 || aiChanges.length > 0;
  const shrinkPage = previewOn || voiceMode;
  const box = groupsWide
    ? "h-8 w-[4.6rem] shrink-0 rounded-full bg-surface-2 px-1.5 text-center text-[0.82rem] leading-8 ring-1 ring-black/8"
    : "h-8 w-[4.4rem] shrink-0 rounded-full bg-surface-2 px-1.5 text-center text-[0.82rem] leading-8 ring-1 ring-black/8";
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

  function teachersForBranch(branchId: number) {
    const fromCrm = crmTeachers.filter((t) => t.branchIds.includes(branchId));
    if (fromCrm.length) return fromCrm.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const seen = new Map<number, CrmTeacher>();
    for (const s of slots) {
      if (s.branchId !== branchId) continue;
      const id = s.teacherId || s.teacherIds?.[0];
      if (!id || !s.teacher) continue;
      if (!seen.has(id)) seen.set(id, { id, name: s.teacher, branchIds: [branchId] });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

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

  function flushPrompt() {
    const live = (promptEl.current?.value || promptRef.current || aiPrompt || "").replace(/\s+/g, " ").trim();
    promptRef.current = live;
    listenBaseRef.current = live;
    accRef.current = "";
    setAiPrompt(live);
    setInterim("");
    return live;
  }

  function commitSpeech(raw: string) {
    const text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text || isEcho(text)) return;
    lastFinalRef.current = text;
    accRef.current = "";
    promptRef.current = text;
    listenBaseRef.current = text;
    setAiPrompt(text);
    setInterim("");
    const { body, cmd } = parseVoice(text);
    if (cmd) {
      void runCmd(cmd, body);
      return;
    }
    if (voiceModeRef.current) {
      void handleScheduleVoice(body || text);
      return;
    }
    if (body) void absorbSpeech(body);
  }

  function unlockTts() {
    try {
      window.speechSynthesis?.getVoices();
    } catch {
      /* */
    }
    const el = ttsRef.current || new Audio();
    ttsRef.current = el;
    el.src = SILENCE;
    el.volume = 1;
    el.play().catch(() => null);
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
    const el = ttsRef.current || new Audio();
    ttsRef.current = el;
    try {
      el.pause();
    } catch {
      /* */
    }
    el.src = src;
    el.volume = Math.min(1, Math.max(0.5, volume || 1));
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
        const ms = Math.max(800, (Number.isFinite(el.duration) ? el.duration : 4) * 1000 + 400);
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
    let played = false;
    try {
      const res = (await Promise.race([
        speakAgent({ data: { text, who: "olga" } }),
        new Promise<{ ok: false }>((resolve) => window.setTimeout(() => resolve({ ok: false }), 8000)),
      ])) as { ok: boolean; audio?: string; volume?: number };
      if (res.ok && res.audio) {
        await playScheduleVoice(String(res.audio), Number(res.volume) || 1);
        played = true;
      }
    } catch {
      /* */
    }
    if (!played) await speakBrowser(text);
    speakingRef.current = false;
    pauseRef.current = false;
    ignoreUntilRef.current = Date.now() + 700;
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
    const flushed = flushPrompt();
    if (extraBody && !voiceModeRef.current) {
      const n = flushed && !flushed.endsWith(extraBody) ? `${flushed} ${extraBody}`.trim() : extraBody || flushed;
      promptRef.current = n;
      listenBaseRef.current = n;
      setAiPrompt(n);
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
      const text = promptRef.current.trim() || flushed;
      const looksEdit = /во\s+всех|у\s+всех|лимит|мест|цифр|поменя|измени|постав|приоритет/i.test(text);
      if (!miss.length && w.course && !looksEdit) {
        setAiAdds([w]);
        addsRef.current = [w];
        setAiComment("Предпросмотр. Нажмите «Опубликовать изменения», если всё верно.");
        setMsg("Предпросмотр готов.");
        if (voiceModeRef.current) await say("Карточка на экране. Скажите опубликовать, если всё верно.");
        return;
      }
      if (!text) {
        if (voiceModeRef.current) await say(miss[0]?.ask || "Сначала назовите курс.");
        else setMsg("Сначала скажите, какую группу добавить, или что изменить.");
        return;
      }
      const local = localLimitPreview(text, slotsRef.current, pickedRef.current);
      if (local) {
        if (local.changes.every((c) => c.field === "priority") || /приоритет/.test(text.toLowerCase())) {
          await applyPriorityNow(local.comment, local.changes, voiceModeRef.current);
          return;
        }
        setAiComment(local.comment);
        setAiChanges(local.changes);
        setAiAdds(local.adds);
        changesRef.current = local.changes;
        addsRef.current = local.adds;
        setMsg(local.comment);
        if (voiceModeRef.current) await say(local.changes.length ? `${local.comment} Скажите опубликовать.` : local.comment);
        return;
      }
      setMsg("Готовлю предпросмотр…");
      const preview = await run("aiPreview", { prompt: text, ids: pickedRef.current });
      const n = preview && "changes" in preview && Array.isArray(preview.changes) ? preview.changes.length : 0;
      const addsN = preview && "adds" in preview && Array.isArray(preview.adds) ? preview.adds.length : 0;
      const comment = preview && "comment" in preview ? String(preview.comment || "") : "";
      if (!n && !addsN) setMsg(comment || "Ничего не менял — уточните запрос.");
      else setMsg(comment || "Предпросмотр готов.");
      if (voiceModeRef.current) await say(comment || (n || addsN ? "Предпросмотр готов. Скажите опубликовать." : "Не поняла запрос. Повторите короче."));
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
    doneRef.current = 0;
    accRef.current = "";
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = true;
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
      const utterance = [accRef.current, mid].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (!utterance) return;
      const shown = [listenBaseRef.current, utterance].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      promptRef.current = shown;
      setAiPrompt(shown);
      setInterim("");
      window.clearTimeout(speechTimer.current);
      speechTimer.current = window.setTimeout(() => {
        const fin = [listenBaseRef.current, accRef.current].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || shown;
        accRef.current = "";
        commitSpeech(fin);
      }, 1400);
    };
    rec.onerror = () => {
      /* onend перезапустит */
    };
    rec.onend = () => {
      doneRef.current = 0;
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
      const live = flushPrompt();
      stopListen();
      dictationRef.current = false;
      if (live) void absorbSpeech(live);
      return;
    }
    dictationRef.current = true;
    listenBaseRef.current = promptRef.current.trim();
    startListen("loop");
    setMsg("Слушаю. Текст появляется в поле сразу. Стрелка — предпросмотр.");
  }

  function toggleVoiceMode() {
    if (voiceMode) {
      stopListen();
      setAsk("");
      return;
    }
    unlockTts();
    setVoiceMode(true);
    voiceModeRef.current = true;
    dictationRef.current = false;
    wizardRef.current = { ...EMPTY_WIZARD };
    setWizard({ ...EMPTY_WIZARD });
    startListen("loop");
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
    setMsg("Секунду…");
    try {
      const res = await Promise.race([
        adminSchedule({ data: { token: token(), action: "voiceAsk", prompt: q, ids: pickedRef.current } as never }),
        new Promise<{ ok: false; error: string }>((resolve) =>
          window.setTimeout(() => resolve({ ok: false, error: "timeout" }), 22000),
        ),
      ]);
      if (!res.ok) {
        await say("Нет, я не могу это поправить, потому что агент расписания не ответил.");
        return;
      }
      const kind = "kind" in res ? String(res.kind) : "edit";
      const reason = "reason" in res ? String(res.reason || "") : "";
      const answer = "answer" in res ? String(res.answer || "") : "";
      const action = "action" in res ? String(res.action || "") : "preview";
      const paneTo = "pane" in res ? String(res.pane || "") : "";
      const query = "query" in res ? String(res.query || "") : "";
      const customerId = "customerId" in res ? Number(res.customerId || 0) : 0;
      const groupId = "groupId" in res ? Number(res.groupId || 0) : 0;
      const slotId = "slotId" in res ? String(res.slotId || "") : "";
      const branchId = "branchId" in res ? Number(res.branchId || 0) : 0;
      const filterStatus = "status" in res ? String((res as { status?: string }).status || "") : "";
      const ageBand = "ageBand" in res ? String((res as { ageBand?: string }).ageBand || "") : "";
      if (kind === "openTab" || kind === "openClient" || kind === "openGroup") {
        if (paneTo === "clients" || kind === "openClient") showPane("clients");
        else if (paneTo === "groups" || kind === "openGroup") showPane("groups");
        else if (paneTo === "subjects" || paneTo === "tariffs" || paneTo === "map" || paneTo === "prices" || paneTo === "public" || paneTo === "crm") {
          showPane(paneTo);
        }
        if (kind === "openClient" && customerId) {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("ra-open-client", { detail: { customerId, branchId: branchId || 1, q: query } }));
          }, 120);
        } else if (filterStatus || ageBand || query || paneTo === "clients") {
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("ra-clients-filter", {
                detail: {
                  q: query,
                  status: filterStatus === "лид" || filterStatus === "архив" || filterStatus === "учится" ? filterStatus : undefined,
                  branchId: branchId || undefined,
                  ageBand: ageBand || undefined,
                },
              }),
            );
          }, 120);
        }
        if (kind === "openGroup" && (groupId || slotId)) {
          const slot = slotsRef.current.find((s) => s.id === slotId || Number(s.groupId) === groupId);
          if (slot) await openDetail(slot);
          else setMsg(`Группа ${groupId || slotId} не найдена в расписании.`);
        }
        await say(answer || "Готово.");
        return;
      }
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
      const local = localLimitPreview(q, slotsRef.current, pickedRef.current);
      if (local) {
        if (local.changes.every((c) => c.field === "priority") || /приоритет/.test(q.toLowerCase())) {
          await applyPriorityNow(local.comment, local.changes, true);
          return;
        }
        setAiComment(local.comment);
        setAiChanges(local.changes);
        setAiAdds(local.adds);
        changesRef.current = local.changes;
        addsRef.current = local.adds;
        setMsg(local.comment);
        await say(local.changes.length ? `${local.comment} Скажите опубликовать.` : local.comment);
        return;
      }
      const preview = await run("aiPreview", { prompt: q, ids: pickedRef.current });
      const n = preview && "changes" in preview && Array.isArray(preview.changes) ? preview.changes.length : 0;
      const comment = preview && "comment" in preview ? String(preview.comment || "") : "";
      const rows = preview && "changes" in preview && Array.isArray(preview.changes) ? (preview.changes as Change[]) : [];
      if (rows.length && rows.every((c) => c.field === "priority")) {
        await applyPriorityNow(comment || `Приоритет у ${rows.length} групп.`, rows, true);
        return;
      }
      if (!n) {
        await say(comment || "Не нашла, что менять. Повторите: приоритет 1 на Гражданской.");
        return;
      }
      if (voiceModeRef.current) await say(`${comment || `Готово, ${n} групп.`} Скажите опубликовать.`);
    } finally {
      busyVoiceRef.current = false;
    }
  }

  async function pullCrm() {
    setBusy(true);
    setPull({ ...emptyPull("groups"), open: true, step: "Подключаюсь к AlfaCRM…" });
    try {
      const st = await pullFromCrm("groups", (step, lines, done, total) => {
        setPull((u) => (u.done ? u : { ...u, step: step || u.step, lines, added: done, total }));
      });
      const fresh = await adminSchedule({ data: { token: token(), action: "get" } });
      take(fresh as never);
      if (!st.ok) {
        const total = slotsRef.current.length;
        if (total) {
          setDirty(new Set());
          setPull({
            ...emptyPull("groups"),
            open: true,
            done: true,
            total,
            lines: [{ ok: true, text: `На сайте уже ${total} групп. AlfaCRM: ${st.error || "не ответила"}.` }],
          });
        } else {
          setPull((u) => ({ ...u, done: true, error: st.error || "AlfaCRM не ответила." }));
        }
        setBusy(false);
        return;
      }
      setDirty(new Set());
      setPull({
        open: true,
        kind: "groups",
        step: "",
        done: true,
        error: String((st as { error?: string }).error || ""),
        lines: ((st as { lines?: { ok: boolean; text: string }[] }).lines || []) as { ok: boolean; text: string }[],
        added: Number((st as { added?: number }).added || 0),
        updated: Number((st as { updated?: number }).updated || 0),
        total: Number((st as { total?: number }).total || slotsRef.current.length),
      });
    } catch (e) {
      const total = slotsRef.current.length;
      setPull({
        ...emptyPull("groups"),
        open: true,
        done: true,
        error: total ? "" : e instanceof Error ? e.message : "Не удалось загрузить.",
        total,
        lines: total ? [{ ok: true, text: `Показано расписание с сайта: ${total} групп.` }] : [],
      });
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
        const pack = res as unknown as { results?: { id: string; ok: boolean; groupId?: number; created?: boolean; error?: string }[]; created?: number; pushed?: number; failed?: number; slots?: CrmSlot[] };
        const rows = Array.isArray(pack.results) ? pack.results : [];
        const created = Number(pack.created || rows.filter((r) => r.created).length);
        const pushed = Number(pack.pushed || rows.filter((r) => r.ok).length);
        const failed = Number(pack.failed || rows.filter((r) => !r.ok).length);
        const lines = rows.map((r) => {
          const s = pack.slots?.find((x) => x.id === r.id || Number(x.groupId) === Number(r.groupId));
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

  async function deleteSelected() {
    const schoolIds = Object.keys(pickedSchools).filter((id) => pickedSchools[id] && id !== "other");
    const courseIds = Object.keys(pickedCourses).filter((id) => pickedCourses[id] && !id.endsWith("#loose"));
    const groupIds = pickedIds;
    if (!schoolIds.length && !courseIds.length && !groupIds.length) return;
    const bits: string[] = [];
    if (schoolIds.length) bits.push(schoolIds.length === 1 ? "1 школу из структуры" : `${schoolIds.length} школы из структуры`);
    if (courseIds.length) bits.push(courseIds.length === 1 ? "1 курс из структуры" : `${courseIds.length} курса из структуры`);
    if (groupIds.length) bits.push(groupIds.length === 1 ? "1 группу из расписания" : `${groupIds.length} групп из расписания`);
    if (!window.confirm(`Удалить: ${bits.join(", ")}? Группы из AlfaCRM не удаляются. Курсы и школы пропадают только на сайте.`)) return;
    if (groupIds.length) {
      const res = await run("remove", { ids: groupIds });
      if (res.ok) {
        setPicked({});
        setDirty((d) => {
          const n = new Set(d);
          for (const id of groupIds) n.delete(id);
          return n;
        });
      }
    }
    if (schoolIds.length || courseIds.length) {
      await run("treeDeleteSelected", { schoolIds, courseIds });
      setPickedSchools({});
      setPickedCourses({});
    }
    setMsg(`Удалено: ${bits.join(", ")}.`);
  }

  const subjectOffer = detail
    ? (() => {
        const courseId = siteCourseValue(detail.slot, siteTree);
        const course = siteTree.courses.find((c) => c.id === courseId);
        const sub = subjects.find((s) => s.id === detail.subjectId);
        const missingInCrm = Boolean(detail.subjectId && sub === undefined);
        return {
          wanted: course?.label || sub?.name || "",
          courseId,
          courseLabel: course?.label || "",
          missingInCrm,
          ok: !missingInCrm,
        };
      })()
    : null;

  return (
    <section className="mt-6 space-y-3">
      <AdminSectionHead
        section="schedule"
        title="Расписание занятий"
        check={false}
        tip="Группы по школам и курсам (courseId). Связи только по ID: группа→курс, предмет, абонемент, клиент."
        extra={
          <button
            type="button"
            data-op="groups-wide"
            className={adminGhostBtn}
            onClick={() => {
              setGroupsWide((v) => !v);
            }}
          >
            {groupsWide ? "Свернуть экран" : "На весь экран"}
          </button>
        }
      >
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
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
                  showPane("groups");
                  if (next) {
                    setOpenAll(true);
                    setOpenSchool("");
                    setOpenCourse("");
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

      <div
        className={cn(groupsWide && "fixed inset-0 z-[60] flex flex-col overflow-hidden bg-bg p-4 md:px-8 md:py-5")}
        data-screen={groupsWide ? "wide" : "normal"}
      >
      <div className="flex shrink-0 flex-nowrap items-center gap-1 border-b border-black/10">
        {([
          ["groups", "Группы"],
          ["clients", "Клиенты"],
          ["subjects", "Предметы"],
          ["prices", "Цены курсов"],
          ["tariffs", "Абонементы"],
          ["map", "Соответствия"],
          ["public", "Сайт"],
          ["crm", "Настройка CRM"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => showPane(id)}
            className={cn(
              "rounded-t-xl px-7 py-2.5 text-base font-semibold transition-colors",
              pane === id ? "bg-primary text-white" : "bg-surface-2 text-fg hover:bg-white",
            )}
          >
            {label}
          </button>
        ))}
        {groupsWide ? (
          <button type="button" data-op="groups-wide-off" className={cn(adminGhostBtn, "ml-auto mb-1")} onClick={() => setGroupsWide(false)}>
            Свернуть экран
          </button>
        ) : null}
      </div>

      <div className={cn("mt-4", groupsWide && "flex min-h-0 flex-1 flex-col overflow-hidden")}>
      {seen.subjects ? (
        <div className={cn(groupsWide && pane === "subjects" && "min-h-0 flex-1 overflow-y-auto")} style={pane === "subjects" ? undefined : { display: "none" }} hidden={pane !== "subjects"}>
          <AdminSubjects />
        </div>
      ) : null}
      {seen.prices ? (
        <div className={cn(groupsWide && pane === "prices" && "min-h-0 flex-1 overflow-y-auto")} style={pane === "prices" ? undefined : { display: "none" }} hidden={pane !== "prices"}>
          <AdminCoursePrices />
        </div>
      ) : null}
      {seen.tariffs ? (
        <div className={cn(groupsWide && pane === "tariffs" && "min-h-0 flex-1 overflow-y-auto")} style={pane === "tariffs" ? undefined : { display: "none" }} hidden={pane !== "tariffs"}>
          <AdminTariffs />
        </div>
      ) : null}
      {seen.map ? (
        <div className={cn(groupsWide && pane === "map" && "min-h-0 flex-1 overflow-y-auto")} style={pane === "map" ? undefined : { display: "none" }} hidden={pane !== "map"}>
          <AdminScheduleMap embedded />
        </div>
      ) : null}
      {seen.public ? (
        <div className={cn(groupsWide && pane === "public" && "min-h-0 flex-1 overflow-y-auto")} style={pane === "public" ? undefined : { display: "none" }} hidden={pane !== "public"}>
          <AdminPublicSite />
        </div>
      ) : null}
      {seen.crm ? (
        <div className={cn(groupsWide && pane === "crm" && "min-h-0 flex-1 overflow-y-auto")} style={pane === "crm" ? undefined : { display: "none" }} hidden={pane !== "crm"}>
          <AdminCrmSettings />
        </div>
      ) : null}
      {seen.clients ? (
        <div
          className={pane === "clients" ? (groupsWide ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "lg:flex lg:sticky lg:top-[5.25rem] lg:z-10 lg:h-[calc(100dvh-5.25rem)] lg:flex-col lg:overflow-hidden lg:bg-bg") : undefined}
          style={pane === "clients" ? undefined : { display: "none" }}
          hidden={pane !== "clients"}
        >
          <AdminClients onOpenGroup={openGroupFromLink} hint={ask} slots={slots} wide={groupsWide} active={pane === "clients"} />
        </div>
      ) : null}
      {seen.groups ? (
      <div className={cn(groupsWide && pane === "groups" && "flex min-h-0 flex-1 flex-col overflow-hidden")} style={pane === "groups" ? undefined : { display: "none" }} hidden={pane !== "groups"}>
      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-visible pb-0.5">
        <Button type="button" size="sm" variant="secondary" className="h-8 shrink-0 px-3 text-[0.78rem]" disabled={busy} onClick={() => { setAddKind("group"); setAddOpen((v) => !v); window.setTimeout(() => document.getElementById("ra-add-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40); }}>
          Добавить
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
                  className={cn("fixed z-[80] min-w-[13rem] p-1", RA_POP)}
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
          disabled={busy || !(pickedIds.length || Object.values(pickedSchools).some(Boolean) || Object.values(pickedCourses).some(Boolean))}
          onClick={() => void deleteSelected()}
        >
          Удалить выбранные
          {pickedIds.length || Object.values(pickedSchools).some(Boolean) || Object.values(pickedCourses).some(Boolean)
            ? ` · ${pickedIds.length + Object.values(pickedSchools).filter(Boolean).length + Object.values(pickedCourses).filter(Boolean).length}`
            : ""}
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
                    className={cn("fixed z-[80] w-[22rem] max-w-[calc(100vw-1.5rem)] p-2", RA_POP)}
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
        <button
          type="button"
          className={cn(adminGhostBtn, "h-8")}
          data-op="check-groups"
          onClick={() => checkRef.current?.run()}
        >
          Проверить группы
        </button>
        </div>
      </div>
      {pane === "groups" ? (
        <AdminSelfTest
          ref={checkRef}
          hideTrigger
          section="schedule-groups"
          label="Проверить группы"
          tip="Прогоняет все функции вкладки с записью в AlfaCRM. Удаление в CRM не делается. Если создали тестовую группу — удалите её сами. Отчёт появляется только после всех проверок. Сбой — красным блоком."
        />
      ) : null}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      {onlyMismatch || groupsWide ? null : (
      <article id="ra-sched-ai" className={cn("sticky top-20 z-20 mt-6 rounded-3xl bg-gradient-to-br from-[#e8f0ff] via-white to-[#eef4ff] ring-2 ring-primary/35 shadow-[0_10px_28px_rgba(32,94,220,0.18)]", shrinkPage ? "p-3 md:p-3" : "p-4 md:p-5")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="font-display text-xl text-primary">Добавить / исправить расписание</p>
            <InfoTip text="Стрелка — предпросмотр. Да, хорошо, делай, опубликовать — на сайт. Нет, не надо, по-другому — скажет, что правим. В CRM — отдельной выгрузкой. Можно назвать курс, возраст, день, время, сколько раз в неделю, филиал, педагога, места." />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.72rem] text-muted">
            <span>отмечено {pickedIds.length}</span>
            <button type="button" className="font-semibold text-primary" onClick={() => setIds(slots.map((s) => s.id), true)}>
              Выделить всё
            </button>
            <button type="button" className="font-semibold text-primary" onClick={() => { setPicked({}); setPickedSchools({}); setPickedCourses({}); }}>
              Снять
            </button>
          </div>
        </div>
        {shrinkPage ? null : (
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Курс, возраст, день, время, ×нед, филиал, педагог, места — можно сказать или написать. Стрелка — предпросмотр.
        </p>
        )}
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
            value={aiPrompt}
            onChange={(e) => { setAiPrompt(e.target.value); promptRef.current = e.target.value; listenBaseRef.current = e.target.value; }}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                flushPrompt();
                void runCmd("готово");
              }
            }}
            placeholder="Добавь художественную студию 3–4 года на Гражданской, вторник с 15:00 до 17:00, педагог Самсонова."
            className="min-h-10 min-w-0 flex-1 resize-none overflow-hidden rounded-xl bg-surface-2 px-3 py-2 text-sm leading-6 ring-1 ring-black/10"
          />
          <button
            type="button"
            title="Отправить запрос — предпросмотр"
            disabled={busy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
            onClick={() => {
              const t = flushPrompt();
              if (!t && !wizard.course) {
                setMsg("Сначала скажите или напишите, что изменить.");
                return;
              }
              void runCmd("готово");
            }}
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M5 12h12M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
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
        {aiComment && !aiAdds.length && !aiChanges.length ? (
          <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-medium text-fg ring-1 ring-black/8">{aiComment}</p>
        ) : null}
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
                          <select value={a.teacher} onChange={(e) => patchAdd(i, "teacher", e.target.value)} className="h-8 w-full rounded-md bg-surface-2 px-1 text-[0.72rem] ring-1 ring-black/8">
                            <option value="">— педагог филиала —</option>
                            {teachersForBranch(matchBranch(a.branch).id).map((t) => (
                              <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                          </select>
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

      {onlyMismatch || !addOpen || groupsWide ? null : (
        <article id="ra-add-panel" className="scroll-mt-24 rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
          <div className="flex rounded-2xl bg-surface-2 p-1">
            {([
              ["school", "Школа"],
              ["course", "Направление"],
              ["group", "Группа"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAddKind(id)}
                className={cn("flex-1 rounded-xl py-2 text-sm font-semibold transition-colors", addKind === id ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg")}
              >
                {label}
              </button>
            ))}
          </div>
          {addKind === "school" ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted">Новая школа на сайте. Например «Танцевальная школа». Потом в ней — направления и группы. В AlfaCRM уйдёт вместе с первой группой.</p>
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Название школы</span>
                <input value={createSchool} onChange={(e) => setCreateSchool(e.target.value)} placeholder="Танцевальная школа" className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              </label>
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={busy || !createSchool.trim()}
                  onClick={async () => {
                    const label = createSchool.trim();
                    const res = await run("treeAddSchool", { label });
                    if (!res.ok) return;
                    setCreateSchool("");
                    setDraft((d) => ({ ...d, school: label, course: "", age: "" }));
                    setAddKind("course");
                    setOpenSchool(label);
                    setMsg(`Школа «${label}» создана. Добавьте направление.`);
                  }}
                >
                  Создать школу
                </Button>
              </div>
            </div>
          ) : null}
          {addKind === "course" ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted">Направление внутри школы. Например «Бальные танцы» для 3–4 лет. После этого можно сразу завести группу.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Школа</span>
                  <select
                    value={siteTree.schools.find((s) => s.id === draft.schoolId || s.label === draft.school)?.id || ""}
                    onChange={(e) => {
                      const sch = siteTree.schools.find((s) => s.id === e.target.value);
                      setDraft((d) => ({ ...d, school: sch?.label || "", schoolId: sch?.id || "", course: "", courseId: "" }));
                    }}
                    className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  >
                    <option value="">Выберите школу</option>
                    {siteTree.schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Направление</span>
                  <input value={createCourse.name} onChange={(e) => setCreateCourse((c) => ({ ...c, name: e.target.value }))} placeholder="Бальные танцы" className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted">Возраст</span>
                  <input value={createCourse.age} onChange={(e) => setCreateCourse((c) => ({ ...c, age: e.target.value }))} placeholder="3-4 года" className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={busy || !draft.school || !createCourse.name.trim()}
                  onClick={async () => {
                    const school = siteTree.schools.find((s) => s.id === draft.schoolId || s.label === draft.school);
                    if (!school) {
                      setMsg("Сначала создайте школу.");
                      return;
                    }
                    const age = createCourse.age.trim();
                    const name = createCourse.name.trim();
                    const label = age && !name.toLowerCase().includes(age.toLowerCase().slice(0, 5)) ? `${name} · ${age}` : name;
                    const res = await run("treeAddCourse", { schoolId: school.id, label, age });
                    if (!res.ok) return;
                    const created = (res.tree || siteTree).courses.find((c) => c.schoolId === school.id && c.label === label);
                    setCreateCourse({ name: "", age: "" });
                    setDraft((d) => ({ ...d, school: school.label, schoolId: school.id, course: label, courseId: created?.id || "", age }));
                    setAddKind("group");
                    setOpenSchool(school.label);
                    setOpenCourse(created?.id || label);
                    setMsg(`Направление «${label}» создано. Заведите группу — расписание.`);
                  }}
                >
                  Создать направление
                </Button>
              </div>
            </div>
          ) : null}
          {addKind === "group" ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted">Группа с расписанием. «Готово» — в предпросмотр, «Опубликовать изменения» — на сайт. В AlfaCRM — «Выгрузить в AlfaCRM».</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Школа</span>
                  <select
                    value={siteTree.schools.find((s) => s.id === draft.schoolId || s.label === draft.school)?.id || ""}
                    onChange={(e) => {
                      const sch = siteTree.schools.find((s) => s.id === e.target.value);
                      setDraft((d) => ({ ...d, school: sch?.label || "", schoolId: sch?.id || "", course: "", courseId: "" }));
                    }}
                    className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  >
                    <option value="">Выберите школу</option>
                    {siteTree.schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Направление</span>
                  <select
                    value={draft.courseId || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      const c = siteTree.courses.find((x) => x.id === id);
                      const sch = c ? siteTree.schools.find((s) => s.id === c.schoolId) : undefined;
                      setDraft((d) => ({
                        ...d,
                        courseId: c?.id || "",
                        course: c?.label || "",
                        schoolId: sch?.id || d.schoolId,
                        school: sch?.label || d.school,
                        age: c?.age || d.age,
                      }));
                    }}
                    className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  >
                    <option value="">Выберите направление</option>
                    {siteTree.courses
                      .filter((c) => !draft.schoolId || c.schoolId === draft.schoolId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                  </select>
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
                  <select
                    value={draft.branch}
                    onChange={(e) => {
                      const branch = e.target.value;
                      const bid = matchBranch(branch).id;
                      const ok = teachersForBranch(bid).some((t) => t.name === draft.teacher);
                      setDraft((d) => ({ ...d, branch, teacher: ok ? d.teacher : "" }));
                    }}
                    className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  >
                    <option value="">Выберите филиал</option>
                    {BRANCH_OPTS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Педагог филиала AlfaCRM</span>
                  <select
                    value={draft.teacher}
                    onChange={(e) => setDraft((d) => ({ ...d, teacher: e.target.value }))}
                    disabled={!draft.branch}
                    className="h-10 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  >
                    <option value="">{draft.branch ? "— педагог этого филиала —" : "Сначала филиал"}</option>
                    {teachersForBranch(draft.branch ? matchBranch(draft.branch).id : 0).map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={busy || !draft.school || !draft.course || !draft.branch}
                  onClick={() => {
                    setAiAdds((list) => [...list, { ...draft }]);
                    setAiComment(`В предпросмотре ${aiAdds.length + 1} групп. Нажмите «Опубликовать изменения».`);
                    setDraft((d) => ({ ...EMPTY_DRAFT, school: d.school, course: d.course, age: d.age }));
                  }}
                >
                  Готово
                </Button>
              </div>
            </div>
          ) : null}
        </article>
      )}

      <div id="ra-mismatch-list" className={cn("mt-8 space-y-4 scroll-mt-24", groupsWide && "mt-3 min-h-0 flex-1 overflow-y-auto pretty-scroll", shrinkPage && !groupsWide && "origin-top [zoom:0.92]")}>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
          <label className="mr-auto flex items-center gap-2 text-[0.8rem] font-semibold text-muted">
            Филиал
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-9 min-w-[16rem] rounded-full bg-white px-3 text-sm font-medium text-fg ring-1 ring-black/10"
            >
              {branchOpts.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </label>
          <div className="flex rounded-2xl bg-surface-2 p-0.5 ring-1 ring-black/8">
            {([
              ["school", "Школу"],
              ["course", "Направление"],
              ["group", "Группу"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setAddKind(id);
                  setAddOpen(true);
                  window.setTimeout(() => document.getElementById("ra-add-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
                }}
                className={cn("rounded-xl px-3 py-1.5 text-[0.78rem] font-semibold", addOpen && addKind === id ? "bg-primary text-white" : "text-fg hover:bg-white")}
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
        {tree.map((sch) => {
          return (
          <article key={sch.schoolId || sch.school} className="rounded-3xl bg-surface shadow-[var(--shadow-border)]">
            <div className="flex w-full items-center gap-3 px-5 py-4">
              <input
                type="checkbox"
                className="h-[13px] w-[13px] shrink-0 accent-primary"
                checked={Boolean(pickedSchools[sch.schoolId])}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  const on = e.target.checked;
                  setPickedSchools((p) => ({ ...p, [sch.schoolId]: on }));
                }}
              />
              <button type="button" className="flex min-w-0 flex-1 items-center justify-between text-left" onClick={() => { setOpenAll(false); setOpenSchool((v) => (v === sch.school ? "" : sch.school)); }}>
                <span className={cn("font-display", groupsWide ? "text-2xl" : "text-xl")}>{sch.school}</span>
                <span className={cn("text-muted", groupsWide ? "text-base" : "text-sm")}>
                  {sch.courses.length
                    ? `${sch.courses.reduce((n, c) => n + c.items.length, 0)} групп · ${sch.courses.filter((c) => c.course !== "Без курса").length} курсов`
                    : "нет курсов"}
                </span>
              </button>
              {sch.schoolId && sch.schoolId !== "other" ? (
                <button
                  type="button"
                  title="Добавить направление"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-lg leading-none text-muted hover:bg-white hover:text-fg"
                  onClick={() => {
                    setDraft((d) => ({ ...d, school: sch.school, course: "", age: "" }));
                    setCreateCourse({ name: "", age: "" });
                    setAddKind("course");
                    setAddOpen(true);
                    window.setTimeout(() => document.getElementById("ra-add-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
                  }}
                >
                  +
                </button>
              ) : null}
            </div>
            {openAll || openSchool === sch.school ? (
              sch.courses.length ? (
                <div className="space-y-2 px-3 pb-3">
                {sch.courses.map((c) => {
                  const canEdit = Boolean(c.courseId) && !String(c.courseId).endsWith("#loose");
                  return (
                  <div
                    key={c.courseId || c.course}
                    className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/8"
                    onDragOver={(e) => {
                      if (canEdit) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = dragId || e.dataTransfer.getData("text/plain");
                      if (id && canEdit) void run("treeMove", { ids: [id], courseId: c.courseId });
                      setDragId("");
                    }}
                  >
                    <div className="flex items-center gap-3 bg-surface-2 px-4 py-2.5">
                      <input
                        type="checkbox"
                        className="h-[13px] w-[13px] shrink-0 accent-primary"
                        checked={Boolean(pickedCourses[c.courseId])}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const on = e.target.checked;
                          setPickedCourses((p) => ({ ...p, [c.courseId]: on }));
                        }}
                      />
                      <button type="button" className="flex min-w-0 flex-1 items-center justify-between text-left" onClick={() => setOpenCourse((v) => (v === c.courseId ? "" : c.courseId))}>
                        <span className={cn("font-medium", groupsWide ? "text-base" : "text-[0.95rem]")}>{c.course}</span>
                        <span className={cn("text-muted", groupsWide ? "text-sm" : "text-[0.85rem]")}>{c.items.length}</span>
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          title="Добавить группу"
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-base leading-none text-muted ring-1 ring-black/8 hover:text-fg"
                          onClick={() => {
                            const hit = siteTree.courses.find((x) => x.id === c.courseId);
                            setDraft((d) => ({ ...d, school: sch.school, course: c.course, age: hit?.age || d.age }));
                            setAddKind("group");
                            setAddOpen(true);
                            window.setTimeout(() => document.getElementById("ra-add-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
                          }}
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                    {openAll || openCourse === c.courseId ? (
                      <div>
                        <table className={cn("w-full text-left", groupsWide ? "text-[0.95rem]" : "text-[0.9rem]")}>
                          <colgroup>
                            <col className="w-10" />
                            <col className={groupsWide ? "w-[18rem]" : undefined} />
                            <col className="w-[4.6rem]" />
                            <col className="w-[3.4rem]" />
                            <col className="w-[7.2rem]" />
                            <col className="w-[5.2rem]" />
                            <col className="w-[7.6rem]" />
                            <col className={groupsWide ? "w-56" : "w-36"} />
                            <col className="w-[8.5rem]" />
                            <col className="w-[3.6rem]" />
                            <col className="w-[4.4rem]" />
                            <col className="w-[5.5rem]" />
                            <col className="w-10" />
                          </colgroup>
                          <thead className="uppercase tracking-wider text-muted text-[0.75rem]">
                            <tr>
                              <th className="px-2 py-2" />
                              <th className="px-2 py-2">Группа · №</th>
                              <th className="px-1 py-2 text-center">Возраст</th>
                              <th className="px-1 py-2 text-center">День</th>
                              <th className="px-1 py-2 text-center">С / до</th>
                              <th className="px-1 py-2 text-center">×нед</th>
                              <th className={cn("px-2 py-2", !groupsWide && "hidden lg:table-cell")}>Филиал</th>
                              <th className="whitespace-nowrap px-2 py-2">Педагог</th>
                              <th className="px-1 py-2">Статус</th>
                              <th className="px-1 py-2 text-center">Приоритет</th>
                              <th className="px-1 py-2 text-center">Места</th>
                              <th className="px-2 py-2">Кто учится</th>
                              <th className="px-1 py-2 text-center">Подробно</th>
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
                                draggable
                                onDragStart={(e) => {
                                  setDragId(s.id);
                                  e.dataTransfer.setData("text/plain", s.id);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => setDragId("")}
                                className={cn("border-t border-black/6", dirty.has(s.id) && "bg-primary/5", flash.has(s.id) && "ra-flash", mm.level === "hard" && "bg-red-50", mm.level === "soft" && !dirty.has(s.id) && "bg-amber-50/80", dragId === s.id && "opacity-50")}
                              >
                                <td className="px-2 py-1.5 align-middle">
                                  <div className="flex items-center gap-1.5">
                                    <CheckBox ids={[s.id]} picked={picked} onToggle={setIds} />
                                    <CrmDot s={s} />
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                  <div className={cn("flex items-center gap-1.5", groupsWide ? "min-w-0" : "min-w-0")}>
                                    {s.groupId ? <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-[0.8rem] text-muted">{s.groupId}</span> : <span className="w-8 shrink-0" />}
                                    {mm.level ? <MismatchDot text={mismatchHint(s)} /> : null}
                                    <GroupNameField large value={s.groupName} subject={s.subject} onChange={(v) => patch(s.id, "groupName", v)} />
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
                                <td
                                  className={cn(
                                    "px-2 py-1.5 align-middle text-[0.78rem] leading-tight text-muted",
                                    !groupsWide && "hidden lg:table-cell",
                                  )}
                                  title={[s.city, s.branch].filter(Boolean).join(", ")}
                                >
                                  <span className="line-clamp-2 whitespace-pre-line">{branchTwoLine(s)}</span>
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                  <select
                                    value={s.teacher}
                                    title={teachersForBranch(s.branchId).some((t) => t.name === s.teacher) ? s.teacher : `${s.teacher || "—"} · нет в филиале AlfaCRM`}
                                    onChange={(e) => {
                                      const name = e.target.value;
                                      const hit = teachersForBranch(s.branchId).find((t) => t.name === name);
                                      setSlots((list) =>
                                        list.map((row) =>
                                          row.id === s.id
                                            ? { ...row, teacher: name, teacherId: hit?.id || 0, teacherIds: hit ? [hit.id] : [] }
                                            : row,
                                        ),
                                      );
                                      setDirty((d) => new Set(d).add(s.id));
                                    }}
                                    className="h-8 w-full rounded-md bg-surface-2 px-1 text-[0.8rem] ring-1 ring-black/8"
                                  >
                                    <option value="">— филиал —</option>
                                    {teachersForBranch(s.branchId).map((t) => (
                                      <option key={t.id} value={t.name}>{t.name}</option>
                                    ))}
                                    {s.teacher && !teachersForBranch(s.branchId).some((t) => t.name === s.teacher) ? (
                                      <option value={s.teacher}>{s.teacher} · нет в филиале</option>
                                    ) : null}
                                  </select>
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <select
                                    value={s.statusId || ""}
                                    title={GROUP_STATUS.find((st) => st.id === s.statusId)?.name || "Статус группы"}
                                    onChange={(e) => void patchFlags(s, "statusId", Number(e.target.value) || 0)}
                                    className="h-8 w-full min-w-[7.5rem] rounded-md bg-surface-2 px-1 text-[0.72rem] ring-1 ring-black/8"
                                  >
                                    <option value="">— статус —</option>
                                    {GROUP_STATUS.map((st) => (
                                      <option key={st.id} value={st.id}>{st.short}</option>
                                    ))}
                                    {s.statusId && !GROUP_STATUS.some((st) => st.id === s.statusId) ? (
                                      <option value={s.statusId}>ID {s.statusId}</option>
                                    ) : null}
                                  </select>
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <select
                                    value={readPriority(s.priority)}
                                    title={GROUP_PRIORITY.find((p) => p.id === readPriority(s.priority))?.name || "Приоритет набора"}
                                    onChange={(e) => void patchFlags(s, "priority", Number(e.target.value))}
                                    className="h-8 w-full rounded-md bg-surface-2 px-0.5 text-center text-[0.8rem] font-semibold ring-1 ring-black/8"
                                  >
                                    {GROUP_PRIORITY.map((p) => (
                                      <option key={p.id} value={p.id}>{p.id}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <input value={s.limit} onChange={(e) => patch(s.id, "limit", Number(e.target.value) || 0)} className={cn(cell, "w-7")} />
                                    <span className="text-[0.8rem] text-muted">/{s.taken}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                  <WhoTip names={names} onNeed={() => void loadWho(s)} />
                                </td>
                                <td className="px-1 py-1.5 align-middle text-center">
                                  <DetailsBtn
                                    on={open}
                                    busy={openingId === s.id}
                                    onClick={() => void openDetail(s)}
                                  />
                                </td>
                              </tr>
                              {open ? (
                                <tr className="bg-[#e8f3ff]">
                                  <td colSpan={13} className="px-4 py-3 text-sm">
                                    <p className="font-medium">Группа {s.groupId} · {s.groupName}</p>
                                    <p className="mt-1 text-muted">
                                      {s.age} · {s.dayLabel} {s.timeFrom && s.timeTo ? `${s.timeFrom}–${s.timeTo}` : "время не указано"} · {s.city}, {s.branch} · {s.teacher} · места {s.limit}/{s.taken}
                                    </p>
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
                <div className="space-y-2 border-t border-black/6 px-5 py-4">
                  <p className="text-sm text-muted">Нет направлений. Нажмите «+» у школы или «+ Направление» сверху.</p>
                </div>
              )
            ) : null}
          </article>
          );
        })}
        {slots.length ? null : <p className="text-sm text-muted">Пока пусто — нажмите «Загрузить из AlfaCRM».</p>}
      </div>
      </div>
      ) : null}
      </div>
      </div>
      {detail
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 md:p-6"
              onPointerDown={(e) => {
                if (Date.now() < closeGuard.current) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onClick={() => {
                if (Date.now() < closeGuard.current) return;
                setPupil(null);
                resetAddPupil();
                setNameEdit(false);
                setDetail(null);
              }}
            >
              <article
                className={cn("relative flex max-h-[min(90vh,920px)] w-full max-w-4xl flex-col overflow-hidden", RA_POP)}
                style={{ background: ADMIN_PANEL_BLUE }}
                onClick={(e) => e.stopPropagation()}
                data-card-id={groupCardId(detail.branchId, detail.groupId)}
                data-group-id={detail.groupId || undefined}
                data-branch-id={detail.branchId || undefined}
              >
                <div className="relative z-30 flex shrink-0 items-start gap-3 px-4 pt-8 md:px-6 md:pt-9">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">Карточка группы · {groupCardId(detail.branchId, detail.groupId)}</p>
                    {nameEdit ? (
                      <input
                        autoFocus
                        value={detail.slot.groupName}
                        onChange={(e) => patch(detail.id, "groupName", e.target.value)}
                        onBlur={() => setNameEdit(false)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") setNameEdit(false);
                        }}
                        className="mt-0.5 h-9 w-full max-w-xl bg-transparent font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-fg outline-none"
                      />
                    ) : (
                      <h2
                        className="mt-0.5 cursor-text font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-fg"
                        title="Нажмите, чтобы переименовать"
                        onClick={() => setNameEdit(true)}
                      >
                        {detail.slot.groupName || "Без названия"}
                      </h2>
                    )}
                    <p className="mt-1 text-[0.78rem] text-muted">
                      <span className="font-bold text-fg">№ {detail.groupId || "на сайте"}</span>
                      {" · "}
                      {detail.slot.city}, {detail.slot.branch}
                    </p>
                    <p className="mt-0.5 whitespace-nowrap text-[0.78rem] text-muted">
                      Учится {detail.slot.takenStudy ?? "—"} · лиды {detail.slot.takenLead ?? "—"} · всего {detail.slot.taken}
                    </p>
                  </div>
                  <div className="ml-auto flex shrink-0 items-start gap-1.5">
                    <button
                      type="button"
                      disabled={detail.saving}
                      className="rounded-full bg-[#d8dce3] px-3 py-1 text-sm font-semibold text-[#5c636c] disabled:opacity-50"
                      onClick={() => void saveDetailSite()}
                    >
                      {detail.saving ? "Сохраняю…" : "Сохранить на сайте"}
                    </button>
                    <button
                      type="button"
                      disabled={detail.saving}
                      className="rounded-full bg-[#d8dce3] px-3 py-1 text-sm font-semibold text-[#5c636c] disabled:opacity-50"
                      onClick={() => void saveDetail()}
                    >
                      {detail.saving ? "Сохраняю…" : detail.groupId ? "Сохранить в AlfaCRM" : "Создать в AlfaCRM"}
                    </button>
                    <div className="flex flex-col items-end">
                    <button type="button" className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white" onClick={() => { setPupil(null); resetAddPupil(); setNameEdit(false); setDetail(null); }}>
                      Закрыть
                    </button>
                    <div className="group/gear relative mt-2.5">
                      <button
                        type="button"
                        aria-label="Поля карточки"
                        title="Какие поля показать"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-primary/80 hover:bg-white/70 hover:text-primary"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                          <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.4.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.4-.96a.5.5 0 0 0-.6.22L2.71 8.84a.49.49 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94 0 .31.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.64l1.92 3.32c.14.24.4.34.6.22l2.4-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.4.96c.22.1.48 0 .6-.22l1.92-3.32a.49.49 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z" />
                        </svg>
                      </button>
                      <div className="pointer-events-none invisible absolute right-0 top-full z-[40] pt-1 opacity-0 transition group-hover/gear:pointer-events-auto group-hover/gear:visible group-hover/gear:opacity-100 group-focus-within/gear:pointer-events-auto group-focus-within/gear:visible group-focus-within/gear:opacity-100">
                        <div className={cn("w-[15.5rem] p-2", RA_POP)}>
                          <p className="px-1.5 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">Поля карточки</p>
                          <div className="pretty-scroll max-h-64 overflow-y-auto">
                            {CARD_FIELDS.map((f) => (
                              <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[0.78rem] hover:bg-black/[0.04]">
                                <input
                                  type="checkbox"
                                  checked={showField(f.id)}
                                  onChange={() => toggleCardField(f.id)}
                                  className="h-3.5 w-3.5 rounded border-black/20 text-primary"
                                />
                                {f.label}
                              </label>
                            ))}
                          </div>
                          {CARD_FIELDS.some((f) => !showField(f.id)) ? (
                            <button type="button" className="mt-1 w-full rounded-md px-1.5 py-1 text-left text-[0.75rem] font-semibold text-primary hover:bg-primary/5" onClick={showAllCardFields}>
                              Показать все
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
                {subjectOffer && !subjectOffer.ok && subjectOffer.missingInCrm ? (
                  <div
                    className="mx-5 mt-3 shrink-0 rounded-xl px-4 py-3 md:mx-6"
                    style={{ background: "#FFD54A", color: "#1A1408", boxShadow: "inset 0 0 0 2px #E6B000" }}
                  >
                    <p className="text-[0.95rem] font-semibold leading-snug">
                      В этом филиале нет предмета «{subjectOffer.wanted || "этого курса"}». Выберите из списка филиала или создайте.
                    </p>
                    <button
                      type="button"
                      disabled={creatingSubject || !subjectOffer.wanted}
                      onClick={() => void createSubjectForBranch()}
                      className="mt-2 flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {creatingSubject ? "Создаём…" : `Создать «${subjectOffer.wanted}»`}
                    </button>
                    {detail.error ? <p className="mt-2 text-sm font-semibold text-red-800">{detail.error}</p> : null}
                  </div>
                ) : null}
                <div className="pretty-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-6 md:pb-5">
                <div className="mt-[1.7rem]">
                    <div className="grid gap-3 md:grid-cols-2">
                    {showField("remarks") ? (
                    <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                      Примечания
                      <input value={detail.remarks} onChange={(e) => setDetail((d) => (d ? { ...d, remarks: e.target.value } : d))} className="mt-1 h-8 w-full rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none transition focus:ring-primary/35" />
                    </label>
                    ) : null}
                    {showField("description") ? (
                    <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                      Описание
                      <input value={detail.description} onChange={(e) => setDetail((d) => (d ? { ...d, description: e.target.value } : d))} className="mt-1 h-8 w-full rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none transition focus:ring-primary/35" />
                    </label>
                    ) : null}
                    </div>
                    {showField("calendar") ? (
                      <GroupLessonStrip
                        className="mt-[1.06rem]"
                        lessons={detail.calendar}
                        group={detail.slot.groupName}
                        subject={detail.slot.subject}
                        teacher={detail.slot.teacher}
                        branchId={detail.branchId}
                        groupId={detail.groupId}
                        onLessons={(calendar) => setDetail((d) => (d ? { ...d, calendar } : d))}
                      />
                    ) : null}
                    <div className="mt-5 grid gap-3">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-[6.75rem_8.75rem_minmax(10.5rem,1fr)_8.25rem_auto_5.5rem]">
                      {showField("age") ? (
                      <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Возраст
                        <input value={detail.slot.age} onChange={(e) => patch(detail.id, "age", e.target.value)} className="mt-1 h-8 w-full rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none transition focus:ring-primary/35" />
                      </label>
                      ) : null}
                      {showField("day") ? (
                      <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        День
                        <RaSelect
                          value={String(shownBeat(detail.slot).day || "")}
                          onChange={(v) => patchBeat(detail.slot, "day", Number(v))}
                          placeholder="день"
                          className={CARD_SEL}
                          options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: DAYS_RU[d] }))}
                        />
                      </label>
                      ) : null}
                      {showField("period") ? (
                      <label className="col-span-2 block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80 sm:col-auto">
                        Период
                        <span className="mt-1 flex h-8 items-center rounded-lg bg-white ring-1 ring-black/[0.07] transition focus-within:ring-primary/35">
                          <input value={detail.bDate} onChange={(e) => setDetail((d) => (d ? { ...d, bDate: e.target.value } : d))} placeholder="01.09.2026" className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-center text-[0.78rem] font-medium text-fg outline-none" />
                          <span className="shrink-0 text-[0.65rem] text-muted/70">—</span>
                          <input value={detail.eDate} onChange={(e) => setDetail((d) => (d ? { ...d, eDate: e.target.value } : d))} placeholder="30.06.2027" className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-center text-[0.78rem] font-medium text-fg outline-none" />
                        </span>
                      </label>
                      ) : null}
                      {showField("time") ? (
                      <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Время
                        <span className="mt-1 flex h-8 items-center rounded-lg bg-white ring-1 ring-black/[0.07] transition focus-within:ring-primary/35">
                          <input value={shownBeat(detail.slot).timeFrom} onChange={(e) => patchBeat(detail.slot, "timeFrom", e.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-center text-[0.8rem] font-medium text-fg outline-none" />
                          <span className="shrink-0 text-[0.65rem] text-muted/70">—</span>
                          <input value={shownBeat(detail.slot).timeTo} onChange={(e) => patchBeat(detail.slot, "timeTo", e.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-center text-[0.8rem] font-medium text-fg outline-none" />
                        </span>
                      </label>
                      ) : null}
                      {showField("week") ? (
                      <div className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        ×нед
                        <div className="mt-1 flex h-8 items-center">
                          <WeekDots
                            s={detail.slot}
                            index={view[detail.slot.id] || 0}
                            onView={(i) => setView((v) => ({ ...v, [detail.slot.id]: i }))}
                            onAdd={(b) => addBeat(detail.slot, b)}
                          />
                        </div>
                      </div>
                      ) : null}
                      {showField("places") ? (
                      <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Места
                        <span className="mt-1 flex h-8 items-center rounded-lg bg-white ring-1 ring-black/[0.07] transition focus-within:ring-primary/35">
                          <input
                            value={detail.slot.limit}
                            onChange={(e) => patch(detail.id, "limit", Number(e.target.value) || 0)}
                            className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-center text-[0.8rem] font-medium text-fg outline-none"
                          />
                          <span className="shrink-0 pr-2 text-[0.75rem] font-medium text-muted">/ {detail.slot.taken}</span>
                        </span>
                      </label>
                      ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                      {showField("branch") ? (
                      <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Филиал
                        <RaSelect
                          value={detail.slot.branchId ? String(detail.slot.branchId) : ""}
                          placeholder="— филиал —"
                          className={CARD_SEL}
                          options={Object.entries(CRM_BRANCH).map(([id, b]) => ({ value: id, label: b.name }))}
                          onChange={(v) => {
                            const branchId = Number(v) || 0;
                            const hit = CRM_BRANCH[branchId];
                            const city = hit?.name.split(",")[0] || "";
                            const branch = hit?.short || "";
                            setSlots((list) => list.map((row) => (row.id === detail.id ? { ...row, branchId, city, branch } : row)));
                            setDirty((d) => new Set(d).add(detail.id));
                            setDetail((d) => (d ? { ...d, branchId, slot: { ...d.slot, branchId, city, branch } } : d));
                          }}
                        />
                      </label>
                      ) : null}
                      {showField("teacher") ? (
                      <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Педагог
                        <RaSelect
                          value={detail.slot.teacher}
                          placeholder="— педагог —"
                          className={CARD_SEL}
                          menuMinWidth={280}
                          options={[
                            ...teachersForBranch(detail.slot.branchId).map((t) => ({ value: t.name, label: t.name })),
                            ...(detail.slot.teacher && !teachersForBranch(detail.slot.branchId).some((t) => t.name === detail.slot.teacher)
                              ? [{ value: detail.slot.teacher, label: `${detail.slot.teacher} · нет в филиале` }]
                              : []),
                          ]}
                          onChange={(name) => {
                            const hit = teachersForBranch(detail.slot.branchId).find((t) => t.name === name);
                            const next = { ...detail.slot, teacher: name, teacherId: hit?.id || 0, teacherIds: hit ? [hit.id] : [] };
                            setSlots((list) => list.map((row) => (row.id === detail.id ? next : row)));
                            setDirty((d) => new Set(d).add(detail.id));
                            setDetail((d) => (d ? { ...d, slot: next } : d));
                          }}
                        />
                      </label>
                      ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                    {showField("tariff") ? (
                    <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                      Абонемент
                      <RaSelect
                        value={detail.tariffId ? String(detail.tariffId) : ""}
                        placeholder="— не выбран —"
                        className={CARD_SEL}
                        menuMinWidth={320}
                        groups={[
                          ...(detail.tariffs.some((t) => t.fit)
                            ? [{
                                label: "Подходят к этой группе",
                                options: detail.tariffs.filter((t) => t.fit).map((t) => ({
                                  value: String(t.id),
                                  label: `${t.name} · ${Math.round(t.price).toLocaleString("ru-RU")} ₽`,
                                })),
                              }]
                            : []),
                          ...(detail.tariffs.some((t) => !t.fit)
                            ? [{
                                label: "Остальные абонементы",
                                options: detail.tariffs.filter((t) => !t.fit).map((t) => ({
                                  value: String(t.id),
                                  label: `${t.name} · ${Math.round(t.price).toLocaleString("ru-RU")} ₽`,
                                })),
                              }]
                            : []),
                        ]}
                        onChange={(v) => setDetail((d) => (d ? { ...d, tariffId: Number(v) || 0 } : d))}
                      />
                    </label>
                    ) : null}
                    {showField("hashtags") ? (
                    <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                      Хэштеги
                      <span className="ml-1 font-normal normal-case tracking-normal text-muted/60">не для привязок</span>
                      <input value={detail.hashtags} onChange={(e) => setDetail((d) => (d ? { ...d, hashtags: e.target.value } : d))} className="mt-1 h-8 w-full rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none transition focus:ring-primary/35" />
                    </label>
                    ) : null}
                    {showField("course") ? (
                    <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                      Курс на сайте
                      <RaSelect
                        value={siteCourseValue(detail.slot, siteTree)}
                        placeholder="— не выбран —"
                        className={CARD_SEL}
                        menuMinWidth={280}
                        groups={siteTree.schools.map((sc) => ({
                          label: sc.label,
                          options: siteTree.courses
                            .filter((x) => x.schoolId === sc.id)
                            .map((x) => ({ value: x.id, label: x.label })),
                        })).filter((g) => g.options.length)}
                        onChange={(to) => {
                          const course = siteTree.courses.find((c) => c.id === to);
                          const school = course ? siteTree.schools.find((x) => x.id === course.schoolId) : undefined;
                          const patchSlot = {
                            ...detail.slot,
                            courseId: to,
                            schoolId: school?.id || "",
                            school: school?.label || "",
                            course: course?.label || "",
                            path: course?.href || "",
                          };
                          setSlots((list) => list.map((row) => (row.id === detail.id ? patchSlot : row)));
                          setDirty((d) => new Set(d).add(detail.id));
                          setDetail((d) => (d ? { ...d, slot: patchSlot } : d));
                          if (!to) return;
                          void run("treeMove", { ids: [detail.slot.id], courseId: to }).then((res) => {
                            if (!res.ok || !("slots" in res) || !Array.isArray(res.slots)) return;
                            const next = (res.slots as CrmSlot[]).find((row) => row.id === detail.slot.id);
                            if (!next) return;
                            setDetail((d) =>
                              d
                                ? {
                                    ...d,
                                    slot: {
                                      ...next,
                                      courseId: to,
                                      schoolId: school?.id || next.schoolId,
                                      school: school?.label || next.school,
                                      course: course?.label || next.course,
                                      path: course?.href || next.path,
                                    },
                                  }
                                : d,
                            );
                          });
                        }}
                      />
                    </label>
                    ) : null}
                    {showField("subject") ? (
                    <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                      Предмет
                      {(() => {
                        const courseId = siteCourseValue(detail.slot, siteTree);
                        const typed = subjects as (CrmSubject & { href?: string; courseId?: string })[];
                        const courseSubs = courseSubjectList(courseId, slots, typed);
                        const courseIds = new Set(courseSubs.map((s) => s.id));
                        const branchSubs = branchSubjectList(slots, detail.branchId, subjects, detail.id).filter((s) => !courseIds.has(s.id));
                        const used = new Set([...courseIds, ...branchSubs.map((s) => s.id)]);
                        const others = subjects.filter((s) => !used.has(s.id));
                        const groups = [
                          ...(courseSubs.length
                            ? [{ label: "К этому курсу сайта", options: courseSubs.map((sub) => ({ value: String(sub.id), label: sub.name })) }]
                            : []),
                          ...(branchSubs.length
                            ? [{ label: "В этом филиале", options: branchSubs.map((sub) => ({ value: String(sub.id), label: sub.name })) }]
                            : []),
                          ...(others.length
                            ? [{ label: "Все предметы CRM", options: others.map((sub) => ({ value: String(sub.id), label: sub.name })) }]
                            : []),
                        ];
                        if (detail.subjectId && !groups.some((g) => g.options.some((o) => o.value === String(detail.subjectId)))) {
                          const orphan = subjects.find((s) => s.id === detail.subjectId);
                          groups.unshift({
                            label: "Сейчас в карточке",
                            options: [{ value: String(detail.subjectId), label: orphan?.name || `предмет ${detail.subjectId}` }],
                          });
                        }
                        const mapped = typed.find((s) => s.id === detail.subjectId);
                        const mappedCourse = mapped?.courseId || "";
                        const mismatch = Boolean(courseId && mappedCourse && mappedCourse !== courseId);
                        return (
                          <>
                          <RaSelect
                            value={detail.subjectId ? String(detail.subjectId) : ""}
                            placeholder="— выберите предмет курса —"
                            className={CARD_SEL}
                            menuMinWidth={260}
                            groups={groups}
                            onChange={(v) => setDetail((d) => (d ? { ...d, subjectId: Number(v) || 0 } : d))}
                          />
                          {mismatch ? (
                            <span className="mt-1 block text-[0.68rem] font-normal normal-case tracking-normal text-amber-800">
                              В соответствиях этот предмет привязан к другому курсу сайта.
                            </span>
                          ) : null}
                          </>
                        );
                      })()}
                    </label>
                    ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-[9.25rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_5.75rem]">
                      {showField("signup") ? (
                      <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Запись
                        <a href={detail.signup || leadHref(detail.slot)} target="_blank" rel="noreferrer" className="mt-1 flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-white px-2.5 text-[0.75rem] font-semibold text-primary ring-1 ring-black/[0.07] transition hover:ring-primary/30">
                          в группу {detail.groupId || "—"}
                        </a>
                      </label>
                      ) : null}
                      {showField("level") ? (
                      <label className="block min-w-0 text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Уровень
                        <RaSelect
                          value={detail.levelId ? String(detail.levelId) : ""}
                          placeholder="— не задан —"
                          className={CARD_SEL}
                          options={[
                            ...levels.map((lv) => ({ value: String(lv.id), label: lv.name })),
                            ...(detail.levelId && !levels.some((lv) => lv.id === detail.levelId)
                              ? [{ value: String(detail.levelId), label: `Уровень ${detail.levelId}` }]
                              : []),
                          ]}
                          onChange={(v) => setDetail((d) => (d ? { ...d, levelId: Number(v) || 0 } : d))}
                        />
                      </label>
                      ) : null}
                      {showField("status") ? (
                      <label className="block min-w-0 text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Статус
                        <RaSelect
                          value={detail.statusId ? String(detail.statusId) : ""}
                          placeholder="— не задан —"
                          className={CARD_SEL}
                          menuMinWidth={220}
                          options={GROUP_STATUS.map((st) => ({ value: String(st.id), label: st.name }))}
                          onChange={(v) => setDetail((d) => (d ? { ...d, statusId: Number(v) || 0 } : d))}
                        />
                      </label>
                      ) : null}
                      {showField("priority") ? (
                      <label className="block min-w-0 text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Приоритет
                        <RaSelect
                          value={String(detail.priority)}
                          placeholder="приоритет"
                          className={CARD_SEL}
                          menuMinWidth={200}
                          options={GROUP_PRIORITY.map((p) => ({ value: String(p.id), label: p.name }))}
                          onChange={(v) => setDetail((d) => (d ? { ...d, priority: Number(v) } : d))}
                        />
                      </label>
                      ) : null}
                      {showField("makeup") ? (
                      <label className="block min-w-0 text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                        Отработка
                        <input value={detail.makeup} onChange={(e) => setDetail((d) => (d ? { ...d, makeup: e.target.value } : d))} className="mt-1 h-8 w-full rounded-lg bg-white px-2 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none transition focus:ring-primary/35" />
                      </label>
                      ) : null}
                      </div>
                    {detail.error ? <p className="text-sm text-red-600">{detail.error}</p> : null}
                    {!detail.groupId ? (
                      <p className="text-sm text-muted">Группа пока только на сайте. «Сохранить на сайте» пишет слот. Экспорт в AlfaCRM ставит создание в очередь — нужен subjectId филиала. Без предмета не создаём, имя курса не подставляем.</p>
                    ) : null}
                    </div>
                  </div>
                  {showField("members") || showField("leads") || showField("archive") || addPupil ? (
                  <section className="mt-3 rounded-xl bg-white/80 p-3 ring-1 ring-black/6">
                    {addPupil ? (
                      <div className="mb-3 rounded-xl bg-[#eef2f7] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted">Добавить ученика</p>
                          <button type="button" className="text-sm font-semibold text-muted hover:text-fg" onClick={resetAddPupil}>
                            закрыть
                          </button>
                        </div>
                        {!detail.groupId ? (
                          <p className="mt-2 text-sm text-muted">Сначала сохраните группу в AlfaCRM — без номера группы ученика не привязать.</p>
                        ) : (
                          <>
                            <input
                              value={addQ}
                              onChange={(e) => setAddQ(e.target.value)}
                              placeholder="Найти по имени или телефону"
                              className="mt-2 h-8 w-full rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none focus:ring-primary/35"
                            />
                            {addHits.length ? (
                              <ul className="mt-1.5 divide-y divide-black/6 overflow-hidden rounded-xl bg-white ring-1 ring-black/6">
                                {addHits.map((h) => (
                                  <li key={`${h.branchId}-${h.crmId}`}>
                                    <button
                                      type="button"
                                      disabled={addBusy}
                                      onClick={() => void attachPupil(h.crmId, h.branchId)}
                                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-primary/5 disabled:opacity-50"
                                    >
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{h.child || "без имени"}</span>
                                        <span className="block truncate text-[0.72rem] text-muted">
                                          {[h.age ? `${h.age} лет` : "", h.parent, h.phone].filter(Boolean).join(" · ")}
                                        </span>
                                      </span>
                                      <span className="shrink-0 text-[0.72rem] font-semibold text-primary">в группу</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : addQ.trim().length >= 2 ? (
                              <p className="mt-1.5 text-[0.75rem] text-muted">Никого не нашла — можно завести нового.</p>
                            ) : null}
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <input
                                value={addForm.name}
                                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Имя ученика"
                                className="h-8 rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none focus:ring-primary/35"
                              />
                              <input
                                value={addForm.parent}
                                onChange={(e) => setAddForm((f) => ({ ...f, parent: e.target.value }))}
                                placeholder="Родитель"
                                className="h-8 rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none focus:ring-primary/35"
                              />
                              <input
                                value={addForm.phone}
                                onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                                placeholder="Телефон"
                                className="h-8 rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none focus:ring-primary/35"
                              />
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                disabled={addBusy}
                                onClick={() => void createAndAttach()}
                                className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                {addBusy ? "Сохраняю…" : "Создать и добавить"}
                              </button>
                              {addErr ? <p className="text-sm text-red-600">{addErr}</p> : <p className="text-[0.72rem] text-muted">Создаёт ученика в AlfaCRM и сразу ставит в эту группу.</p>}
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                    {showField("members") ? (
                    <CrmGroupMembers
                      title="Ученики"
                      items={detail.members.filter((m) => m.status !== "лид")}
                      onOpen={(m) => void openPupil(m, detail.branchId)}
                      onAdd={() => setAddPupil(true)}
                      onRemove={(m) => void removePupil(m)}
                      busyId={memberBusy}
                    />
                    ) : null}
                    {showField("leads") ? (
                    <CrmGroupMembers
                      title="Лиды"
                      items={detail.members.filter((m) => m.status === "лид")}
                      onOpen={(m) => void openPupil(m, detail.branchId)}
                      onRemove={(m) => void removePupil(m)}
                      variant="lead"
                      busyId={memberBusy}
                    />
                    ) : null}
                    {showField("archive") ? (
                    <CrmGroupMembers
                      title="Архивные ученики"
                      items={detail.archive}
                      onOpen={(m) => void openPupil(m, detail.branchId)}
                      onRemove={(m) => void removePupil(m)}
                      variant="archive"
                      busyId={memberBusy}
                    />
                    ) : null}
                  </section>
                  ) : null}
                </div>
              </article>
            </div>,
            document.body,
          )
        : null}
      {pupil && typeof document !== "undefined"
        ? createPortal(
            <CrmClientCard
              card={pupil}
              loading={pupilLoading}
              backLabel={detail ? "К группе" : "Закрыть"}
              onClose={() => setPupil(null)}
              onAction={mutatePupil}
              onOpenGroup={(gid, bid) => {
                setPupil(null);
                openGroupFromLink(gid, bid);
              }}
            />,
            document.body,
          )
        : null}
      {pull.open ? <CrmPullDialog pull={pull} onClose={() => setPull((u) => ({ ...u, open: false }))} /> : null}
      {pushUi.open
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => pushUi.done && setPushUi((u) => ({ ...u, open: false }))}>
              <div className={cn("w-full max-w-md p-6", RA_POP)} onClick={(e) => e.stopPropagation()}>
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
