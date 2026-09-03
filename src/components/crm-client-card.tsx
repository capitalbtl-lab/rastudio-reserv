"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { clientCardId, CRM_BRANCH, groupCardId, SUBJECT_TO_COURSE } from "@/data/ids";
import { ADMIN_PANEL_BLUE, RA_POP } from "@/data/admin-ui";
import { displayPersonName, displayParent, initialsOf } from "@/data/client-display";
import {
  CARD_LESSON_TYPES,
  CARD_PAY_KINDS,
  CARD_STUDY_STATUS,
  type CustomerCard,
  type CustomerComm,
  type ClientLesson,
  type ClientRegular,
  type LessonCatalog,
  type TariffOffer,
  type GroupOffer,
} from "@/data/crm-cards";
import { Button } from "@/components/ui/button";
import { LessonStrip, toYmd } from "@/components/lesson-strip";
import { RaSelect } from "@/components/ra-select";
import { SCHOOLS } from "@/data/site";

function money(n?: number) {
  return `${Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addPeriod(iso: string, count: number, type: number) {
  if (!iso || !count) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  if (type === 1) d.setDate(d.getDate() + count);
  else if (type === 2) d.setDate(d.getDate() + count * 7);
  else if (type === 3) d.setMonth(d.getMonth() + count);
  else if (type === 4) d.setFullYear(d.getFullYear() + count);
  else return "";
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ruIso(iso: string) {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function schoolOfSubject(id: number, path?: string) {
  const p = String(path || SUBJECT_TO_COURSE[id] || "");
  if (/art-studio|sculptural|digitalart|hudvuz|portrait/i.test(p)) return "Художественная школа";
  if (/robot/i.test(p)) return "Школа робототехники";
  if (/programmirovaniya|it-школ|it-лаборатор|start-scratch|scratch/i.test(p)) return "Школа программирования";
  if (/3d-modeling|science|tesla|radio|gamedesign|mental|kinder-master/i.test(p)) return "Школа наук и инженерии";
  if (/model-school|podium/i.test(p)) return "Модельная школа";
  if (/preparation|happybricks|planet-steam|prep-school/i.test(p)) return "Школа раннего развития";
  if (/english|korean|japanese|vitamin|language/i.test(p)) return "Школа иностранных языков";
  return "Прочее";
}

const SCHOOL_LABELS = SCHOOLS.map((s) => s.label);

function resolveSchool(g: { school?: string; schoolId?: string; subjectId?: number; courseId?: string }) {
  if (g.school && SCHOOL_LABELS.includes(g.school)) return g.school;
  if (g.schoolId) {
    const hit = SCHOOLS.find((s) => s.href === g.schoolId || s.href === `/${String(g.schoolId).replace(/^\//, "")}`);
    if (hit) return hit.label;
  }
  const from = schoolOfSubject(g.subjectId || 0, g.courseId);
  if (from && from !== "Прочее") return from;
  return g.school && g.school !== "Прочее" ? g.school : "";
}

const PERIOD_HINTS = [
  { id: 1, one: "день", few: "дня", many: "дней" },
  { id: 2, one: "неделя", few: "недели", many: "недель" },
  { id: 3, one: "месяц", few: "месяца", many: "месяцев" },
  { id: 4, one: "год", few: "года", many: "лет" },
];

function schoolShort(name: string) {
  return name
    .replace(/^Школа\s+/i, "")
    .replace(/^Художественная школа$/i, "Художественная")
    .replace(/^наук и инженерии$/i, "Науки")
    .replace(/^иностранных языков$/i, "Языки")
    .replace(/^раннего развития$/i, "Раннее развитие")
    .replace(/^робототехники$/i, "Робототехника")
    .replace(/^программирования$/i, "Программирование")
    .replace(/^Модельная школа$/i, "Модельная");
}

function equalBtn(on: boolean) {
  return cn(
    "flex h-8 w-full items-center justify-center truncate rounded-full px-2 text-[0.72rem] font-semibold leading-none transition-colors",
    on ? "bg-primary text-white" : "bg-[#eef1f6] text-[#3d4450] hover:bg-[#e3e7ee]",
  );
}

function academicEndIso() {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() + 1 : d.getFullYear();
  return `${y}-06-30`;
}

function durationMins(from?: string, to?: string) {
  const a = String(from || "").split(":").map(Number);
  const b = String(to || "").split(":").map(Number);
  if (a.length < 2 || b.length < 2) return 0;
  const n = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
  return n > 0 && n <= 480 ? n : 0;
}

const fieldCtl = "h-9 w-full rounded-md bg-white px-2 text-sm ring-1 ring-black/10";

function Field({ label, required, top, children }: { label: string; required?: boolean; top?: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid grid-cols-[8.6rem_minmax(0,1fr)] gap-3 text-[0.82rem]", top ? "items-start" : "items-center")}>
      <span className={cn("text-muted", top && "pt-1.5")}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </div>
  );
}

function Comm({ c }: { c: CustomerComm }) {
  return (
    <div className={cn("rounded-xl px-3 py-2 text-sm ring-1 ring-black/6", c.incoming ? "bg-white" : "bg-primary/8")}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
        {[c.at, c.channel, c.who].filter(Boolean).join(" · ")}
        {c.incoming ? " · входящее" : ""}
      </p>
      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{c.text}</p>
    </div>
  );
}

function weekdayNum(label: string) {
  const s = String(label || "")
    .toLowerCase()
    .replace(/ё/g, "е");
  const map: [string, number][] = [
    ["понедельник", 1],
    ["вторник", 2],
    ["среда", 3],
    ["четверг", 4],
    ["пятница", 5],
    ["суббота", 6],
    ["воскресенье", 7],
    ["пн", 1],
    ["вт", 2],
    ["ср", 3],
    ["чт", 4],
    ["пт", 5],
    ["сб", 6],
    ["вс", 7],
  ];
  for (const [k, n] of map) if (s === k || s.startsWith(k)) return n;
  return 0;
}

function lessonsForCard(calendar: ClientLesson[] | undefined, regular: ClientRegular[] | undefined): GroupCalLesson[] {
  const out: GroupCalLesson[] = [];
  const seen = new Set<string>();
  for (const l of calendar || []) {
    const date = toYmd(l.date);
    if (!date || date.length < 10) continue;
    const key = `${date}|${l.from}|${l.group}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      date,
      from: l.from,
      to: l.to,
      status: Number(l.status || 0) || 1,
      type: l.type || "Групповое",
      typeId: l.typeId || undefined,
      teacher: l.teacher,
      subject: l.subject,
      group: l.group,
      room: l.room,
      lessonId: l.id || undefined,
    });
  }
  if (out.length >= 4) return out.sort((a, b) => a.date.localeCompare(b.date));
  const d0 = new Date();
  d0.setHours(12, 0, 0, 0);
  for (const r of regular || []) {
    const wd = weekdayNum(r.day);
    if (!wd) continue;
    const jsWant = wd === 7 ? 0 : wd;
    for (let i = -56; i <= 126; i++) {
      const cur = new Date(d0);
      cur.setDate(d0.getDate() + i);
      if (cur.getDay() !== jsWant) continue;
      const date = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      const key = `${date}|${r.from}|${r.groupName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        date,
        from: r.from,
        to: r.to,
        status: 1,
        type: "Групповое",
        teacher: r.teacher,
        subject: r.subject,
        group: r.groupName,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

type CardAction = "customerSave" | "customerLesson" | "customerPay" | "customerTariff" | "customerGroup";

function LeadField({ label, area, span, children }: { label: string; area?: string; span?: boolean; children: ReactNode }) {
  return (
    <label
      className={cn("flex min-w-0 flex-col gap-1 overflow-hidden text-[0.68rem] font-semibold uppercase tracking-wide text-muted", span && "col-span-2")}
      style={area ? { gridArea: area } : undefined}
    >
      <span className="leading-none">{label}</span>
      {children}
    </label>
  );
}

export function CrmClientCard({
  card,
  loading,
  onClose,
  onOpenGroup,
  onAction,
  backLabel,
  variant = "overlay",
  groupChoices,
  wide,
  layout = "default",
}: {
  card: CustomerCard;
  loading?: boolean;
  onClose: () => void;
  onOpenGroup?: (groupId: number, branchId: number) => void;
  onAction?: (action: CardAction, extra?: Record<string, unknown>) => Promise<void>;
  backLabel?: string;
  variant?: "overlay" | "panel";
  groupChoices?: GroupOffer[];
  wide?: boolean;
  layout?: "default" | "lead" | "client";
}) {
  const id = Number(card.id) || 0;
  const cardKey = card.cardId || clientCardId(id);
  const articleRef = useRef<HTMLElement>(null);
  const [domWide, setDomWide] = useState(Boolean(wide));
  const [cardW, setCardW] = useState(0);
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setCardW(w);
      setDomWide(w >= 880);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [wide, card.id]);
  const leadLayout = layout === "lead";
  const clientLayout = leadLayout ? false : layout === "client" || Boolean(wide) || (domWide && cardW >= 720);
  const compact = !clientLayout;
  const title = displayPersonName(card.name, card.parent, card.phones[0]);
  const parent = displayParent(card.name, card.parent);
  const branch = CRM_BRANCH[card.branchId]?.short || "";
  const [name, setName] = useState(card.name);
  const [legal, setLegal] = useState(card.parent);
  const [phone, setPhone] = useState(card.phones[0] || "");
  const [email, setEmail] = useState(card.emails[0] || "");
  const [note, setNote] = useState(card.note);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [channel, setChannel] = useState("");
  const [payKind, setPayKind] = useState("");
  const [paySum, setPaySum] = useState("");
  const [headMenu, setHeadMenu] = useState<"" | "pay" | "lesson">("");
  const headLeave = useRef(0);

  function armHeadLeave() {
    window.clearTimeout(headLeave.current);
    headLeave.current = window.setTimeout(() => setHeadMenu(""), 2000);
  }
  function cancelHeadLeave() {
    window.clearTimeout(headLeave.current);
  }

  useEffect(() => () => window.clearTimeout(headLeave.current), []);
  const [lessonKey, setLessonKey] = useState("");
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lessonDate, setLessonDate] = useState(todayIso());
  const [lessonTime, setLessonTime] = useState(card.regular?.[0]?.from || "16:00");
  const [lessonMins, setLessonMins] = useState(90);
  const [lessonGroup, setLessonGroup] = useState(0);
  const [lessonSubject, setLessonSubject] = useState(0);
  const [lessonTeacher, setLessonTeacher] = useState(0);
  const [lessonRoom, setLessonRoom] = useState(0);
  const [lessonTopic, setLessonTopic] = useState("");
  const [lessonNote, setLessonNote] = useState("");
  const [tariffOpen, setTariffOpen] = useState(false);
  const [tariffId, setTariffId] = useState(0);
  const [tariffGroup, setTariffGroup] = useState(0);
  const [tariffFrom, setTariffFrom] = useState(todayIso());
  const [tariffTo, setTariffTo] = useState("");
  const [tariffPeriod, setTariffPeriod] = useState(0);
  const [tariffPeriodType, setTariffPeriodType] = useState(1);
  const [tariffCalc, setTariffCalc] = useState(0);
  const [tariffSubs, setTariffSubs] = useState<number[]>([]);
  const [tariffLessons, setTariffLessons] = useState<number[]>([]);
  const [tariffSchool, setTariffSchool] = useState("");
  const [tariffNote, setTariffNote] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupId, setGroupId] = useState(0);
  const [groupBranch, setGroupBranch] = useState(0);
  const [groupDir, setGroupDir] = useState("");
  const [groupFrom, setGroupFrom] = useState(todayIso());
  const [groupTo, setGroupTo] = useState(academicEndIso());

  useEffect(() => {
    setName(card.name);
    setLegal(card.parent);
    setPhone(card.phones[0] || "");
    setEmail(card.emails[0] || "");
    setNote(card.note);
    setLessonTime(card.regular?.[0]?.from || "");
  }, [card]);

  const channels = useMemo(() => {
    const set = new Set(card.comms.map((c) => c.channel || "сообщение"));
    return [...set];
  }, [card.comms]);
  const comms = channel ? card.comms.filter((c) => (c.channel || "сообщение") === channel) : card.comms;
  const tiles = useMemo(() => lessonsForCard(card.calendar, card.regular), [card.calendar, card.regular]);
  const catalog: LessonCatalog = card.catalog || { subjects: [], teachers: [], rooms: [], tariffs: [], groups: [] };
  const tariffOffers: TariffOffer[] = catalog.tariffs || [];
  const groupOffers: GroupOffer[] = groupChoices?.length ? groupChoices : catalog.groups || [];
  const pupilGroups = useMemo(() => {
    const list = [...(card.groups || [])];
    list.sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || String(a.name).localeCompare(String(b.name), "ru"));
    return list;
  }, [card.groups]);
  const activeGroups = pupilGroups.filter((g) => g.active);
  const activeTariffs = (card.tariffs || []).filter((t) => !t.archived);
  const subjectsBySchool = useMemo(() => {
    const map = new Map<string, { id: number; name: string }[]>();
    const seen = new Set<number>();
    const push = (school: string, id: number, name: string) => {
      if (!id || seen.has(id) && map.get(school)?.some((x) => x.id === id)) {
        /* still allow same subject in one school */
      }
      const arr = map.get(school) || [];
      if (!arr.some((x) => x.id === id)) arr.push({ id, name });
      map.set(school, arr);
    };
    for (const g of groupOffers) {
      if (g.subjectId) {
        const name = catalog.subjects.find((s) => s.id === g.subjectId)?.name || g.course || `предмет ${g.subjectId}`;
        push(g.school || schoolOfSubject(g.subjectId, g.courseId), g.subjectId, name);
        seen.add(g.subjectId);
      }
    }
    for (const s of catalog.subjects || []) {
      push(schoolOfSubject(s.id), s.id, s.name);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [catalog.subjects, groupOffers]);
  const schoolSubjectList = useMemo(() => {
    if (tariffSchool) return subjectsBySchool.find(([name]) => name === tariffSchool)?.[1] || [];
    const uniq = new Map<number, { id: number; name: string }>();
    for (const [, list] of subjectsBySchool) for (const s of list) if (!uniq.has(s.id)) uniq.set(s.id, s);
    return [...uniq.values()];
  }, [subjectsBySchool, tariffSchool]);
  const freeGroups = useMemo(() => {
    const joined = new Set((card.groups || []).map((g) => g.id));
    return groupOffers.filter((g) => !joined.has(g.id));
  }, [groupOffers, card.groups]);
  const branchGroups = useMemo(
    () => freeGroups.filter((g) => !groupBranch || g.branchId === groupBranch),
    [freeGroups, groupBranch],
  );
  const schoolOptions = useMemo(() => {
    const extra: string[] = [];
    for (const g of branchGroups) {
      const label = resolveSchool(g);
      if (label && !SCHOOL_LABELS.includes(label) && !extra.includes(label)) extra.push(label);
    }
    extra.sort((a, b) => a.localeCompare(b, "ru"));
    return [...SCHOOL_LABELS, ...extra];
  }, [branchGroups]);
  const shownGroups = useMemo(() => {
    const list = groupDir ? branchGroups.filter((g) => resolveSchool(g) === groupDir) : branchGroups;
    return [...list].sort((a, b) => {
      const da = a.course || "";
      const db = b.course || "";
      const d = da.localeCompare(db, "ru");
      if (d) return d;
      return a.name.localeCompare(b.name, "ru");
    });
  }, [branchGroups, groupDir]);
  const groupByDir = useMemo(() => {
    const map = new Map<string, GroupOffer[]>();
    for (const g of shownGroups) {
      const key = g.course || "Прочее";
      const arr = map.get(key) || [];
      arr.push(g);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [shownGroups]);
  const pickedGroup = shownGroups.find((g) => g.id === groupId && g.branchId === groupBranch) || freeGroups.find((g) => g.id === groupId && (!groupBranch || g.branchId === groupBranch));
  const pickedTariff = tariffOffers.find((t) => t.id === tariffId);

  function applyGroup(id: number) {
    setLessonGroup(id);
    const g = (card.groups || []).find((x) => x.id === id);
    const reg = (card.regular || []).find((r) => r.groupId === id);
    if (g?.subjectId) setLessonSubject(g.subjectId);
    else if (reg?.subjectId) setLessonSubject(reg.subjectId);
    if (reg?.from) setLessonTime(reg.from);
    const mins = durationMins(reg?.from, reg?.to);
    if (mins) setLessonMins(mins);
    if (reg?.teacherId) setLessonTeacher(reg.teacherId);
    if (reg?.roomId) setLessonRoom(reg.roomId);
  }

  function openLesson(key: string) {
    const g = (card.groups || []).find((x) => x.active !== false) || (card.groups || [])[0];
    const reg = (card.regular || []).find((r) => r.groupId === g?.id) || (card.regular || [])[0];
    setLessonKey(key);
    setLessonDate(todayIso());
    setLessonTime(reg?.from || "16:00");
    setLessonMins(durationMins(reg?.from, reg?.to) || 90);
    setLessonGroup(g?.id || 0);
    setLessonSubject(g?.subjectId || reg?.subjectId || 0);
    setLessonTeacher(reg?.teacherId || 0);
    setLessonRoom(reg?.roomId || 0);
    setLessonTopic("");
    setLessonNote("");
    setLessonOpen(true);
  }

  function applyTariffPick(id: number, from = todayIso()) {
    const t = tariffOffers.find((x) => x.id === id);
    const count = Number(t?.periodCount || 0);
    const unit = Number(t?.periodType || 1) || 1;
    setTariffId(id);
    setTariffFrom(from);
    setTariffPeriod(count);
    setTariffPeriodType(unit);
    setTariffTo(addPeriod(from, count, unit) || t?.eDate || "");
    setTariffCalc(Number(t?.calculationType) === 2 ? 1 : 0);
    setTariffSubs(t?.subjectIds?.length ? [...t.subjectIds] : []);
    setTariffLessons(t?.lessonTypeIds?.length ? [...t.lessonTypeIds] : [2]);
    setTariffNote("");
    const firstSub = (t?.subjectIds || [])[0];
    setTariffSchool(firstSub ? schoolOfSubject(firstSub) : "");
  }

  function openTariff() {
    const subIds = (card.groups || []).map((g) => Number(g.subjectId) || 0).filter(Boolean);
    const preferred =
      tariffOffers.find((t) => (t.subjectIds || []).some((id) => subIds.includes(id))) || tariffOffers[0];
    applyTariffPick(preferred?.id || 0);
    const groups = card.groups || [];
    setTariffGroup(groups.length === 1 ? groups[0].id : 0);
    setTariffOpen(true);
  }

  const typeName = CARD_LESSON_TYPES.find((t) => t.key === lessonKey)?.name || "Занятие";
  const subjectOpts = useMemo(() => {
    const list = [...(catalog.subjects || [])];
    if (lessonSubject && !list.some((s) => s.id === lessonSubject)) {
      const g = (card.groups || []).find((x) => x.subjectId === lessonSubject);
      const r = (card.regular || []).find((x) => x.subjectId === lessonSubject);
      list.unshift({ id: lessonSubject, name: r?.subject || g?.name || `предмет ${lessonSubject}` });
    }
    return list;
  }, [catalog.subjects, lessonSubject, card.groups, card.regular]);
  const teacherOpts = useMemo(() => {
    const list = [...(catalog.teachers || [])];
    if (lessonTeacher && !list.some((s) => s.id === lessonTeacher)) {
      const r = (card.regular || []).find((x) => x.teacherId === lessonTeacher);
      list.unshift({ id: lessonTeacher, name: r?.teacher || `педагог ${lessonTeacher}` });
    }
    return list;
  }, [catalog.teachers, lessonTeacher, card.regular]);

  async function run(action: CardAction, extra?: Record<string, unknown>) {
    if (!onAction) return;
    setBusy(action);
    setMsg("");
    try {
      await onAction(action, extra);
      setMsg("Сохранено в AlfaCRM.");
      setPayKind("");
      setPaySum("");
      setHeadMenu("");
      setLessonKey("");
      setLessonOpen(false);
      setTariffOpen(false);
      setGroupOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy("");
    }
  }

  const metaLine = [card.gender, card.age, branch].filter(Boolean).join(" · ");
  const leadTight = compact && cardW > 0 && cardW < 360;
  const leadRoomy = compact && cardW >= 520;

  const headBtns = (
    <div className={cn("flex shrink-0 items-center gap-1", compact && "flex-wrap justify-end")}>
            <div className="relative" onMouseEnter={cancelHeadLeave} onMouseLeave={armHeadLeave}>
              <button
                type="button"
                data-op="add-pay"
                onClick={() => {
                  cancelHeadLeave();
                  setHeadMenu((v) => (v === "pay" ? "" : "pay"));
                }}
                className={cn(
                  "h-7 rounded-full font-semibold",
                  compact ? "px-2 text-[0.65rem]" : "px-2.5 text-[0.68rem]",
                  headMenu === "pay" ? "bg-black/20 text-fg" : "bg-black/8 text-muted hover:bg-black/12",
                )}
              >
                Оплата ▾
              </button>
              {headMenu === "pay" ? (
                <div className={cn("absolute right-0 top-8 z-[80] w-64 p-2", RA_POP)} data-op="pay-menu">
                  <p className="px-1.5 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                    Остаток {money(card.balance)} · {card.lessonsLeft || 0} ур.
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {CARD_PAY_KINDS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        data-pay-kind={p.id}
                        className={cn("rounded-lg px-2 py-1.5 text-left text-[0.78rem] font-medium", payKind === p.id ? "bg-primary/10 text-primary" : "hover:bg-surface-2")}
                        onClick={() => setPayKind(p.id)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  {payKind ? (
                    <div className="mt-2 flex gap-1.5">
                      <input
                        value={paySum}
                        onChange={(e) => setPaySum(e.target.value)}
                        placeholder="сумма"
                        className="h-8 min-w-0 flex-1 rounded-lg bg-surface-2 px-2 text-sm ring-1 ring-black/8"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 px-2.5 text-[0.72rem]"
                        data-op="customerPay"
                        disabled={Boolean(busy)}
                        onClick={() => void run("customerPay", { payKind, sum: Number(String(paySum).replace(",", ".")) })}
                      >
                        Провести
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="relative" onMouseEnter={cancelHeadLeave} onMouseLeave={armHeadLeave}>
              <button
                type="button"
                data-op="assign-lesson"
                onClick={() => {
                  cancelHeadLeave();
                  setHeadMenu((v) => (v === "lesson" ? "" : "lesson"));
                }}
                className={cn(
                  "h-7 rounded-full font-semibold",
                  compact ? "px-2 text-[0.65rem]" : "px-2.5 text-[0.68rem]",
                  headMenu === "lesson" ? "bg-black/20 text-fg" : "bg-black/8 text-muted hover:bg-black/12",
                )}
              >
                Занятие ▾
              </button>
              {headMenu === "lesson" ? (
                <div className={cn("absolute right-0 top-8 z-[80] w-56 p-1.5", RA_POP)} data-op="lesson-menu">
                  {CARD_LESSON_TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      data-lesson-type={t.key}
                      data-lesson-type-id={t.id}
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-[0.78rem] font-medium hover:bg-surface-2"
                      onClick={() => {
                        setHeadMenu("");
                        openLesson(t.key);
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              className={cn("h-8 px-3 text-[0.78rem]", compact && "h-7 px-2.5 text-[0.72rem]")}
              data-op="save-contacts"
              disabled={!onAction || Boolean(busy)}
              onClick={() => void run("customerSave", { patch: { name, parent: legal, phone, email, note } })}
            >
              {busy === "customerSave" ? "Сохраняю…" : "Сохранить"}
            </Button>
            {variant !== "panel" ? (
              <button type="button" className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-muted ring-1 ring-black/8" onClick={onClose}>
                {backLabel || "Закрыть"}
              </button>
            ) : null}
    </div>
  );

  const statusChips = (
            <div className={cn("flex min-w-0 items-center gap-1.5", compact ? "flex-1 flex-nowrap overflow-hidden" : "flex-wrap pb-1")}>
            <button
              type="button"
              data-op="set-client-status"
              data-is-study="1"
              disabled={!onAction || Boolean(busy)}
              onClick={() => void run("customerSave", { isStudy: 1 })}
              className={cn(
                "shrink-0 rounded-full py-1 font-semibold",
                leadTight ? "px-2 text-[0.65rem]" : "px-2.5 text-[0.72rem]",
                card.status === "учится" ? "bg-primary text-white" : "bg-white ring-1 ring-black/8",
              )}
            >
              Клиент
            </button>
            <button
              type="button"
              data-op="set-client-status"
              data-is-study="0"
              disabled={!onAction || Boolean(busy)}
              onClick={() => void run("customerSave", { isStudy: 0 })}
              className={cn(
                "shrink-0 rounded-full py-1 font-semibold",
                leadTight ? "px-2 text-[0.65rem]" : "px-2.5 text-[0.72rem]",
                card.status === "лид" ? "bg-amber-500 text-white" : "bg-white ring-1 ring-black/8",
              )}
            >
              Лид
            </button>
            <RaSelect
              value={card.studyStatusId ? String(card.studyStatusId) : ""}
              onChange={(v) => void run("customerSave", { studyStatusId: Number(v) || 0 })}
              disabled={!onAction || Boolean(busy)}
              placeholder="состояние"
              className={cn(
                "h-7 rounded-full px-2.5 text-[0.72rem] font-semibold",
                compact ? "min-w-0 w-auto flex-1 max-w-[8.5rem]" : "w-auto min-w-[9.5rem]",
              )}
              options={CARD_STUDY_STATUS.map((s) => ({ value: String(s.id), label: s.name }))}
            />
          </div>
  );

  const balanceBox = (
          <div className={cn("shrink-0 text-right", compact ? "pl-1.5" : "pb-0.5 pr-1")}>
            <p className={cn("font-display leading-none tabular-nums tracking-tight", compact ? "text-[1.2rem]" : "text-[2.15rem]")}>{money(card.balance)}</p>
            <p className={cn("mt-0.5 text-muted", compact ? "text-[0.6rem]" : "text-[0.68rem]")}>{card.lessonsLeft || 0} ур. · до {card.paidTill || "—"}</p>
          </div>
  );

  const article = (
    <article
      ref={articleRef}
      className={cn(
        "relative flex flex-col overflow-hidden",
        variant === "overlay"
          ? "max-h-[min(92vh,960px)] w-full max-w-4xl rounded-[1.4rem] shadow-[0_22px_60px_rgba(15,23,42,0.28)]"
          : "h-full min-h-0 w-full rounded-[1.2rem] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]",
      )}
      style={{ background: ADMIN_PANEL_BLUE, containerType: "inline-size" }}
      onClick={variant === "overlay" ? (e) => e.stopPropagation() : undefined}
      data-card-id={cardKey}
      data-customer-id={id || undefined}
      data-layout={layout}
      data-card-w={cardW || undefined}
      data-is-study={card.isStudy ?? (card.status === "учится" ? 1 : card.status === "архив" ? 2 : 0)}
      data-balance={card.balance ?? 0}
    >
      {compact ? (
      <header className="flex shrink-0 flex-col gap-2 px-3.5 pt-3.5">
        {headBtns}
        <div className="min-w-0">
          <h4 className="font-display text-[1.22rem] leading-[1.2] break-words">{title || (loading ? "Загружаю…" : "Без имени")}</h4>
          {metaLine ? <p className="mt-0.5 truncate whitespace-nowrap text-[0.75rem] text-muted">{metaLine}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {statusChips}
          {balanceBox}
        </div>
      </header>
      ) : (
      <header className="flex shrink-0 flex-col gap-3 px-4 pt-4 md:px-5">
        <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-primary ring-1 ring-black/6">
            {initialsOf(title)}
          </span>
          <div className="min-w-0">
            <h4 className="font-display text-[1.35rem] leading-tight">{title || (loading ? "Загружаю…" : "Без имени")}</h4>
            <p className="mt-1 truncate whitespace-nowrap text-[0.78rem] text-muted">{metaLine}</p>
          </div>
        </div>
        {headBtns}
        </div>
        <div className="flex items-end justify-between gap-3">
          {statusChips}
          {balanceBox}
        </div>
      </header>
      )}

      <div className="pretty-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-5 md:px-5">
        {clientLayout ? (
          <div className="grid grid-cols-5 gap-x-3 gap-y-1">
            {["Ребёнок", "Заказчик", "Телефон", "Почта", "Заметка"].map((cap) => (
              <span key={cap} className="min-w-0 truncate text-[0.68rem] font-semibold uppercase tracking-wide text-muted">
                {cap}
              </span>
            ))}
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm font-medium text-fg ring-1 ring-black/8" />
            <input value={legal} onChange={(e) => setLegal(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm font-medium text-fg ring-1 ring-black/8" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm text-fg ring-1 ring-black/8" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm text-fg ring-1 ring-black/8" />
            <input value={note} onChange={(e) => setNote(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm text-fg ring-1 ring-black/8" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <label className={cn("block min-w-0", !leadRoomy && "col-span-2")}>
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-muted">Ребёнок</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm font-medium text-fg ring-1 ring-black/8" />
            </label>
            <label className={cn("block min-w-0", !leadRoomy && "col-span-2")}>
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-muted">Заказчик</span>
              <input value={legal} onChange={(e) => setLegal(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm font-medium text-fg ring-1 ring-black/8" />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-muted">Телефон</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm text-fg ring-1 ring-black/8" />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-muted">Почта</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm text-fg ring-1 ring-black/8" />
            </label>
            <label className="col-span-2 block min-w-0">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-muted">Заметка</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-sm text-fg ring-1 ring-black/8" />
            </label>
          </div>
        )}
        {card.dob ? <p className="mt-2 text-[0.78rem] text-muted">Дата рождения {card.dob}{card.age ? ` · ${card.age}` : ""}</p> : null}

        <div className={cn("mt-4 grid gap-3", !compact && "sm:grid-cols-2")}>
          <div className="min-w-0 rounded-2xl bg-white/80 px-3 py-3 ring-1 ring-black/6" data-op="active-group">
            <div className={cn(compact ? "flex flex-col items-start gap-2" : "flex items-center gap-2")}>
              <p className="min-w-0 flex-1 truncate text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Действующая группа</p>
              <Button
                type="button"
                size="sm"
                className={cn("h-7 shrink-0 whitespace-nowrap px-2.5 text-[0.72rem]", !compact && "ml-auto")}
                data-op="add-group"
                disabled={!onAction || Boolean(busy)}
                onClick={() => {
                  setGroupBranch(card.branchId || 1);
                  setGroupDir("");
                  setGroupId(0);
                  setGroupFrom(todayIso());
                  setGroupTo(academicEndIso());
                  setGroupOpen(true);
                }}
              >
                Добавить в группу
              </Button>
            </div>
            {activeGroups.length ? (
              <ul className="mt-2 space-y-1.5">
                {activeGroups.map((g) => {
                  const reg = (card.regular || []).find((r) => r.groupId === g.id);
                  return (
                    <li key={`${g.branchId}-${g.id}`}>
                      <button
                        type="button"
                        data-group-id={g.id}
                        data-branch-id={g.branchId}
                        data-card-id={groupCardId(g.branchId, g.id)}
                        className="w-full rounded-xl bg-white px-3 py-2 text-left ring-1 ring-primary/20 hover:bg-primary/5"
                        onClick={() => onOpenGroup?.(g.id, g.branchId)}
                      >
                        <p className="font-semibold text-sm">{g.name || `группа ${g.id}`}</p>
                        <p className="text-[0.75rem] text-muted">
                          {[reg ? `${reg.day} ${reg.from}–${reg.to}` : "", reg?.teacher || "", CRM_BRANCH[g.branchId]?.short]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Группа не привязана.</p>
            )}
          </div>
          <div className="min-w-0 rounded-2xl bg-white/80 px-3 py-3 ring-1 ring-black/6" data-op="active-tariff">
            <div className={cn(compact ? "flex flex-col items-start gap-2" : "flex items-center gap-2")}>
              <p className="min-w-0 flex-1 truncate text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Действующий абонемент</p>
              <Button
                type="button"
                size="sm"
                className={cn("h-7 shrink-0 whitespace-nowrap px-2.5 text-[0.72rem]", !compact && "ml-auto")}
                data-op="add-tariff"
                disabled={!onAction || Boolean(busy)}
                onClick={() => openTariff()}
              >
                Добавить абонемент
              </Button>
            </div>
            {activeTariffs.length ? (
              <ul className="mt-2 space-y-1.5">
                {activeTariffs.map((t) => (
                  <li key={t.id} className="rounded-xl bg-white px-3 py-2 ring-1 ring-black/6">
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-[0.75rem] text-muted">
                      {money(t.rest)}
                      {t.lessons ? ` · ${t.lessons} ур.` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Абонемента ученика нет.</p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white/70 px-3 py-3 ring-1 ring-black/6">
          <LessonStrip
            lessons={tiles}
            title="Ближайшие занятия"
            group={(card.groups || [])[0]?.name}
            teacher={card.teacher || (card.regular || [])[0]?.teacher}
            subject={(card.regular || [])[0]?.subject}
          />
        </div>

        {card.url ? (
          <a href={card.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-primary">
            Открыть в AlfaCRM
          </a>
        ) : null}

        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-display text-lg">Коммуникации</p>
            <button type="button" onClick={() => setChannel("")} className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", !channel ? "bg-fg text-white" : "bg-white ring-1 ring-black/8")}>
              Все
            </button>
            {channels.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", channel === ch ? "bg-fg text-white" : "bg-white ring-1 ring-black/8")}
              >
                {ch}
              </button>
            ))}
          </div>
          {loading && !card.comms.length ? <p className="mt-2 text-sm text-muted">Подгружаю карточку из AlfaCRM…</p> : null}
          {comms.length ? (
            <div className="mt-2 space-y-2">
              {comms.map((c, i) => (
                <Comm key={c.id || i} c={c} />
              ))}
            </div>
          ) : loading ? null : (
            <p className="mt-2 text-sm text-muted">Переписки в карточке пока нет.</p>
          )}
        </div>
        {msg ? <p className="mt-3 text-sm font-medium text-primary">{msg}</p> : null}
        {busy ? <p className="mt-1 text-sm text-muted">Пишу в AlfaCRM…</p> : null}
      </div>
    </article>
  );

  const dialog = lessonOpen ? (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/45 p-4" onClick={() => setLessonOpen(false)} data-op="lesson-dialog">
      <div className={cn("w-full max-w-[34rem]", RA_POP)} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-black/8 px-5 py-3">
          <h3 className="font-display text-lg">{typeName} — запланировать</h3>
          <button type="button" className="rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2" onClick={() => setLessonOpen(false)} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="space-y-3 px-5 py-4">
          <Field label="Тип занятия" required>
            <RaSelect
              value={lessonKey}
              onChange={setLessonKey}
              options={CARD_LESSON_TYPES.map((t) => ({ value: t.key, label: t.name }))}
            />
          </Field>
          <Field label="Дата" required>
            <input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} className={fieldCtl} />
          </Field>
          <Field label="Время" required>
            <div className="flex items-center gap-2">
              <span className="text-muted">с</span>
              <input value={lessonTime} onChange={(e) => setLessonTime(e.target.value)} placeholder="16:00" className={cn(fieldCtl, "max-w-[7rem]")} />
              <span className="text-muted">мин</span>
              <input
                type="number"
                min={15}
                max={480}
                value={lessonMins}
                onChange={(e) => setLessonMins(Number(e.target.value) || 0)}
                className={cn(fieldCtl, "max-w-[5.5rem]")}
              />
            </div>
          </Field>
          <Field label="Аудитория">
            <div className="flex items-center gap-2">
              <RaSelect
                value={lessonRoom ? String(lessonRoom) : ""}
                onChange={(v) => setLessonRoom(Number(v) || 0)}
                placeholder="(не задан)"
                options={(catalog.rooms || []).map((r) => ({ value: String(r.id), label: r.name }))}
              />
              {(catalog.rooms || []).length ? (
                <span className="shrink-0 text-[0.75rem] text-muted">{catalog.rooms.length} доступно</span>
              ) : null}
            </div>
          </Field>
          <Field label="Группа">
            <RaSelect
              value={lessonGroup ? String(lessonGroup) : ""}
              onChange={(v) => applyGroup(Number(v) || 0)}
              placeholder="не выбрана"
              options={(card.groups || []).map((g) => ({ value: String(g.id), label: g.name || `группа ${g.id}` }))}
            />
          </Field>
          <Field label="Предмет" required>
            <RaSelect
              value={lessonSubject ? String(lessonSubject) : ""}
              onChange={(v) => setLessonSubject(Number(v) || 0)}
              placeholder="выберите"
              options={subjectOpts.map((s) => ({ value: String(s.id), label: s.name }))}
            />
          </Field>
          <Field label="Педагог">
            <RaSelect
              value={lessonTeacher ? String(lessonTeacher) : ""}
              onChange={(v) => setLessonTeacher(Number(v) || 0)}
              placeholder="выберите"
              options={teacherOpts.map((t) => ({ value: String(t.id), label: t.name }))}
            />
          </Field>
          <Field label="Тема">
            <input value={lessonTopic} onChange={(e) => setLessonTopic(e.target.value)} placeholder="(не задан)" className={fieldCtl} />
          </Field>
          <Field label="Комментарий">
            <textarea value={lessonNote} onChange={(e) => setLessonNote(e.target.value)} rows={2} placeholder="Например, задержится на 10 мин" className="w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-black/10" />
          </Field>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-black/8 px-5 py-3">
          <button type="button" className="h-9 rounded-full px-4 text-sm font-semibold text-muted hover:bg-surface-2" onClick={() => setLessonOpen(false)}>
            Отмена
          </button>
          <Button
            type="button"
            size="sm"
            className="h-9"
            data-op="customerLesson"
            disabled={!onAction || Boolean(busy) || !lessonSubject}
            onClick={() =>
              void run("customerLesson", {
                lessonType: lessonKey,
                date: lessonDate,
                time: lessonTime,
                duration: lessonMins,
                groupId: lessonGroup || undefined,
                subjectId: lessonSubject || undefined,
                roomId: lessonRoom || undefined,
                teacherId: lessonTeacher || undefined,
                topic: lessonTopic || undefined,
                note: lessonNote || undefined,
              })
            }
          >
            {busy === "customerLesson" ? "Сохраняю…" : "Сохранить"}
          </Button>
        </footer>
      </div>
    </div>
  ) : null;
  const dialogNode = dialog && typeof document !== "undefined" ? createPortal(dialog, document.body) : dialog;

  const tariffDialog = tariffOpen ? (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-3 backdrop-blur-[3px]" onClick={() => setTariffOpen(false)} data-op="tariff-dialog">
      <div className={cn("flex max-h-[min(94vh,54rem)] w-full max-w-[50rem] flex-col overflow-hidden", RA_POP)} onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div>
            <h3 className="font-display text-[1.4rem] leading-tight tracking-tight">Добавить абонемент</h3>
            <p className="mt-1 text-sm text-muted">{title}</p>
          </div>
          <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full text-lg leading-none text-muted hover:bg-surface-2" onClick={() => setTariffOpen(false)} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="pretty-scroll min-h-0 flex-1 space-y-4 px-6 pb-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Группа *</span>
              <RaSelect
                value={tariffGroup ? String(tariffGroup) : ""}
                onChange={(v) => setTariffGroup(Number(v) || 0)}
                className="h-11 rounded-[14px] bg-[#f3f5f9] px-3 ring-black/8"
                placeholder={pupilGroups.length ? "Выберите группу ученика" : "Ученик не в группе"}
                options={pupilGroups.map((g) => {
                  const reg = (card.regular || []).find((r) => r.groupId === g.id);
                  return {
                    value: String(g.id),
                    label: [g.name || `группа ${g.id}`, reg ? `${reg.day} ${reg.from}` : "", CRM_BRANCH[g.branchId]?.short].filter(Boolean).join(" · "),
                  };
                })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Абонемент *</span>
              <RaSelect
                value={tariffId ? String(tariffId) : ""}
                onChange={(v) => applyTariffPick(Number(v) || 0, tariffFrom)}
                className="h-11 rounded-[14px] bg-[#f3f5f9] px-3 ring-black/8"
                menuMinWidth={360}
                placeholder={tariffOffers.length ? "Выберите абонемент" : "Нет абонементов в филиале"}
                options={tariffOffers.map((t) => ({
                  value: String(t.id),
                  label: t.periodLabel ? `${t.name} · ${t.periodLabel}` : t.name,
                }))}
              />
            </label>
          </div>

          <div>
            <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Период *</span>
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-[16px] bg-[#f3f5f9] p-2 ring-1 ring-black/6">
              <span className="shrink-0 pl-1.5 text-[0.75rem] font-medium text-muted">с</span>
              <input
                type="date"
                value={tariffFrom}
                onChange={(e) => {
                  const from = e.target.value;
                  setTariffFrom(from);
                  setTariffTo(addPeriod(from, tariffPeriod, tariffPeriodType));
                }}
                className="h-10 w-[9.4rem] shrink-0 rounded-[12px] bg-white px-2 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/35"
              />
              <input
                type="number"
                min={1}
                value={tariffPeriod || ""}
                placeholder="N"
                onChange={(e) => {
                  const count = Number(e.target.value) || 0;
                  setTariffPeriod(count);
                  setTariffTo(addPeriod(tariffFrom, count, tariffPeriodType));
                }}
                className="h-10 w-14 shrink-0 rounded-[12px] bg-white px-1 text-center text-sm font-semibold outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/35"
              />
              <div className="flex shrink-0 rounded-full bg-white p-0.5 ring-1 ring-black/8">
                {PERIOD_HINTS.filter((u) => u.id !== 4 || (tariffPeriod > 0 && tariffPeriod < 10)).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setTariffPeriodType(u.id);
                      setTariffTo(addPeriod(tariffFrom, tariffPeriod, u.id));
                    }}
                    className={cn(
                      "h-9 rounded-full px-2.5 text-[0.75rem] font-semibold transition-colors",
                      tariffPeriodType === u.id ? "bg-primary text-white" : "text-muted hover:text-fg",
                    )}
                  >
                    {tariffPeriod ? `${tariffPeriod} ${periodWord(tariffPeriod, u)}` : u.many}
                  </button>
                ))}
              </div>
              <span className="shrink-0 text-[0.75rem] font-medium text-muted">до</span>
              <input
                type="date"
                value={tariffTo}
                onChange={(e) => setTariffTo(e.target.value)}
                className="h-10 w-[9.4rem] shrink-0 rounded-[12px] bg-white px-2 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/35"
              />
            </div>
            {pickedTariff ? (
              <p className="mt-1.5 text-[0.78rem] text-muted">
                {money(pickedTariff.price)}
                {pickedTariff.lessons ? ` · ${pickedTariff.lessons} урока` : ""}
                {tariffTo ? ` · по ${ruIso(tariffTo)}` : ""}
              </p>
            ) : null}
          </div>

          <div>
            <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Тип расчётов *</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTariffCalc(0)}
                className={cn(
                  "rounded-[16px] px-4 py-3 text-left transition-colors ring-1",
                  tariffCalc === 0 ? "bg-primary/8 ring-primary/35" : "bg-[#f3f5f9] ring-black/6 hover:ring-black/12",
                )}
              >
                <p className="text-sm font-semibold">Базовый</p>
                <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">Расчёты идут по общему счёту карточки</p>
              </button>
              <button
                type="button"
                onClick={() => setTariffCalc(1)}
                className={cn(
                  "rounded-[16px] px-4 py-3 text-left transition-colors ring-1",
                  tariffCalc === 1 ? "bg-primary/8 ring-primary/35" : "bg-[#f3f5f9] ring-black/6 hover:ring-black/12",
                )}
              >
                <p className="text-sm font-semibold">Раздельный</p>
                <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">Отдельный счёт — выбирают при платеже</p>
              </button>
            </div>
          </div>

          <div>
            <div className="mb-3 grid grid-cols-5 gap-1.5">
              <button type="button" onClick={() => setTariffSchool("")} className={equalBtn(!tariffSchool)}>
                Все школы
              </button>
              {subjectsBySchool.map(([name, list]) => (
                <button key={name} type="button" title={`${name} · ${list.length}`} onClick={() => setTariffSchool(name)} className={equalBtn(tariffSchool === name)}>
                  {schoolShort(name)}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
                    Предметы * · {tariffSubs.length}
                  </span>
                  <button
                    type="button"
                    className="text-[0.72rem] font-semibold text-primary hover:underline"
                    onClick={() => {
                      const ids = schoolSubjectList.map((s) => s.id);
                      const allOn = ids.length > 0 && ids.every((id) => tariffSubs.includes(id));
                      setTariffSubs((list) => (allOn ? list.filter((id) => !ids.includes(id)) : [...new Set([...list, ...ids])]));
                    }}
                  >
                    {schoolSubjectList.length && schoolSubjectList.every((s) => tariffSubs.includes(s.id)) ? "Снять все" : "Выбрать все"}
                  </button>
                </div>
                <div className="max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
                  {schoolSubjectList.length ? (
                    schoolSubjectList.map((s) => {
                      const on = tariffSubs.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setTariffSubs((list) => (on ? list.filter((x) => x !== s.id) : [...list, s.id]))}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-[12px] px-2.5 py-1.5 text-left transition-colors",
                            on ? "bg-primary/10" : "hover:bg-[#f3f5f9]",
                          )}
                        >
                          <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[0.65rem] font-bold", on ? "bg-primary text-white" : "bg-white ring-1 ring-black/15 text-transparent")}>
                            ✓
                          </span>
                          <span className="text-[0.82rem] leading-snug">{s.name}</span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="py-4 text-[0.78rem] text-muted">Нет предметов в этой школе</p>
                  )}
                </div>
              </section>
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
                    Типы уроков * · {tariffLessons.length}
                  </span>
                  <button
                    type="button"
                    className="text-[0.72rem] font-semibold text-primary hover:underline"
                    onClick={() => {
                      const ids = CARD_LESSON_TYPES.map((t) => t.id);
                      setTariffLessons(tariffLessons.length === ids.length ? [] : ids);
                    }}
                  >
                    {tariffLessons.length === CARD_LESSON_TYPES.length ? "Снять все" : "Выбрать все"}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CARD_LESSON_TYPES.map((t) => {
                    const on = tariffLessons.includes(t.id);
                    return (
                      <button key={t.id} type="button" title={t.name} onClick={() => setTariffLessons((list) => (on ? list.filter((x) => x !== t.id) : [...list, t.id]))} className={equalBtn(on)}>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Комментарий</span>
            <textarea
              value={tariffNote}
              onChange={(e) => setTariffNote(e.target.value)}
              rows={2}
              placeholder="Необязательно"
              className="w-full resize-none rounded-[14px] bg-[#f3f5f9] px-3 py-2.5 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/35"
            />
          </label>
        </div>
        <footer className="flex shrink-0 items-center gap-3 border-t border-black/6 bg-[#fafbfd] px-6 py-3.5">
          <p className="mr-auto min-w-0 truncate text-[0.78rem] text-muted">
            {[
              pickedTariff ? money(pickedTariff.price) : "",
              tariffPeriod ? `${tariffPeriod} ${periodWord(tariffPeriod, PERIOD_HINTS.find((u) => u.id === tariffPeriodType) || PERIOD_HINTS[0])}` : "",
              tariffSubs.length ? `${tariffSubs.length} предм.` : "",
              tariffLessons.length ? `${tariffLessons.length} тип.` : "",
            ]
              .filter(Boolean)
              .join(" · ") || "Заполните группу и абонемент"}
          </p>
          <button type="button" className="h-10 rounded-full px-4 text-sm font-semibold text-muted hover:bg-white" onClick={() => setTariffOpen(false)}>
            Отмена
          </button>
          <Button
            type="button"
            className="h-10 rounded-full px-5"
            data-op="customerTariff"
            disabled={!onAction || Boolean(busy) || !tariffId || (pupilGroups.length > 0 && !tariffGroup)}
            onClick={() =>
              void run("customerTariff", {
                tariffId,
                date: tariffFrom,
                eDate: tariffTo,
                groupId: tariffGroup || undefined,
                calcType: tariffCalc,
                isSeparateBalance: tariffCalc,
                subjectIds: tariffSubs,
                lessonTypeIds: tariffLessons,
                periodCount: tariffPeriod,
                periodType: tariffPeriodType,
                note: tariffNote || undefined,
              })
            }
          >
            {busy === "customerTariff" ? "Сохраняю…" : "Сохранить"}
          </Button>
        </footer>
      </div>
    </div>
  ) : null;
  const tariffNode = tariffDialog && typeof document !== "undefined" ? createPortal(tariffDialog, document.body) : tariffDialog;

  const groupDialog = groupOpen ? (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/45 p-4" onClick={() => setGroupOpen(false)} data-op="group-dialog">
      <div className={cn("w-full max-w-[34rem]", RA_POP)} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-black/8 px-5 py-3">
          <h3 className="font-display text-lg">Добавить в группу</h3>
          <button type="button" className="rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2" onClick={() => setGroupOpen(false)} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="space-y-3 px-5 py-4">
          <Field label="Клиент">
            <input value={title} readOnly className={cn(fieldCtl, "bg-surface-2 text-fg")} />
          </Field>
          <Field label="Филиал" required>
            <RaSelect
              value={groupBranch ? String(groupBranch) : ""}
              onChange={(v) => {
                const next = Number(v) || 0;
                setGroupBranch(next);
                setGroupDir("");
                setGroupId(0);
              }}
              placeholder="выберите филиал"
              options={Object.entries(CRM_BRANCH).map(([id, b]) => ({ value: id, label: b.short }))}
            />
          </Field>
          <Field label="Школа">
            <RaSelect
              value={groupDir}
              onChange={(v) => {
                setGroupDir(v);
                setGroupId(0);
              }}
              disabled={!groupBranch}
              placeholder="все школы филиала"
              options={[
                { value: "", label: "все школы филиала" },
                ...schoolOptions.map((label) => ({ value: label, label })),
              ]}
            />
          </Field>
          <Field label="Группа" required>
            <RaSelect
              value={groupId && groupBranch ? `${groupBranch}:${groupId}` : ""}
              onChange={(v) => {
                const [b, id] = v.split(":");
                if (b) setGroupBranch(Number(b) || 0);
                setGroupId(Number(id) || 0);
              }}
              disabled={!groupBranch}
              menuMinWidth={420}
              placeholder={shownGroups.length ? "выберите группу" : groupBranch ? "нет групп в этой выборке" : "сначала филиал"}
              groups={groupByDir.map(([dir, list]) => ({
                label: dir,
                options: list.map((g) => ({
                  value: `${g.branchId}:${g.id}`,
                  label: [g.name, g.day && g.from ? `${g.day} ${g.from}` : ""].filter(Boolean).join(" · "),
                  hint: g.teacher,
                })),
              }))}
            />
          </Field>
          {pickedGroup?.teacher ? (
            <p className="pl-[8.6rem] text-[0.78rem] text-muted">{pickedGroup.teacher}</p>
          ) : null}
          <Field label="Период">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input type="date" value={groupFrom} onChange={(e) => setGroupFrom(e.target.value)} className={fieldCtl} />
              <span className="text-sm text-muted">—</span>
              <input type="date" value={groupTo} onChange={(e) => setGroupTo(e.target.value)} className={fieldCtl} />
            </div>
          </Field>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-black/8 px-5 py-3">
          <button type="button" className="h-9 rounded-full px-4 text-sm font-semibold text-muted hover:bg-surface-2" onClick={() => setGroupOpen(false)}>
            Отмена
          </button>
          <Button
            type="button"
            size="sm"
            className="h-9"
            data-op="customerGroup"
            disabled={!onAction || Boolean(busy) || !groupId}
            onClick={() => void run("customerGroup", { groupId, branchId: pickedGroup?.branchId || card.branchId, bDate: groupFrom, eDate: groupTo })}
          >
            {busy === "customerGroup" ? "Сохраняю…" : "Сохранить"}
          </Button>
        </footer>
      </div>
    </div>
  ) : null;
  const groupNode = groupDialog && typeof document !== "undefined" ? createPortal(groupDialog, document.body) : groupDialog;

  if (variant === "panel") {
    return (
      <>
        {article}
        {dialogNode}
        {tariffNode}
        {groupNode}
      </>
    );
  }
  const overlay = (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-3 md:p-6" onClick={onClose}>
      {article}
    </div>
  );
  if (typeof document === "undefined") {
    return (
      <>
        {overlay}
        {dialog}
        {tariffDialog}
        {groupDialog}
      </>
    );
  }
  return (
    <>
      {createPortal(overlay, document.body)}
      {dialogNode}
      {tariffNode}
      {groupNode}
    </>
  );
}
