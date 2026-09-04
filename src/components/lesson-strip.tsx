"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { GroupCalLesson } from "@/data/crm-slots-core";
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

function LessonTile({
  lesson: l,
  today,
  onEnter,
  onLeave,
  onClick,
}: {
  lesson: GroupCalLesson;
  today: string;
  onEnter: (el: HTMLElement, lesson: GroupCalLesson) => void;
  onLeave: () => void;
  onClick?: (el: HTMLElement, lesson: GroupCalLesson) => void;
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
      onClick={(e) => onClick?.(e.currentTarget, l)}
      data-op="lesson-tile"
      data-lesson-date={l.date}
      data-lesson-id={l.lessonId || undefined}
      data-lesson-status={l.status}
      className={cn(
        "flex h-[3.35rem] w-[2.4rem] min-w-[2.4rem] cursor-pointer flex-col items-center justify-center rounded-lg px-0.5 text-center leading-tight shadow-[0_1px_3px_rgba(15,23,42,0.12)]",
        isToday && !cancelled && "ra-today-tile text-white",
        !isToday && done && "bg-emerald-100 text-fg ring-1 ring-emerald-400/80",
        !isToday && planned && "bg-white text-fg ring-1 ring-neutral-500/55",
        cancelled && "bg-neutral-200 text-neutral-400 ring-1 ring-neutral-300 line-through",
      )}
    >
      {isToday && !cancelled ? (
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
  pinned,
  busy,
  error,
  onClose,
  onOpen,
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
  pinned?: boolean;
  busy?: boolean;
  error?: string;
  onClose?: () => void;
  onOpen?: () => void;
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
  const canAct = Boolean(onOpen);
  const btn = "h-8 rounded-lg bg-[#d8dce3] text-[0.75rem] font-semibold text-[#5c636c] disabled:opacity-45";
  return (
    <div
      className={cn("fixed z-[240] w-[20.5rem] p-3 text-left text-[0.78rem] leading-snug text-fg", RA_POP)}
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
  customers: { id: number; name: string }[];
  subjectId: number;
  teacherIds: number[];
  topic: string;
  note: string;
};

const FIELD = "mt-1 h-8 w-full rounded-lg bg-white px-2.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none";

function LessonEdit({
  branchId,
  groupId,
  seed,
  onClose,
  onSaved,
}: {
  branchId: number;
  groupId: number;
  seed: GroupCalLesson;
  onClose: () => void;
  onSaved: (patch: Partial<GroupCalLesson>) => void;
}) {
  const lessonId = seed.lessonId || 0;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<LessonForm | null>(null);
  const [rooms, setRooms] = useState<{ id: number; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: number; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: number; name: string }[]>([]);

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
        setForm({
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
          note: seed.note || "",
        });
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
      setForm({
        ...pack.lesson,
        date: toYmd(pack.lesson.date),
        groupIds: pack.lesson.groupIds?.length ? pack.lesson.groupIds : groupId ? [groupId] : [],
        customerIds: pack.lesson.customerIds || [],
        customers: pack.lesson.customers || [],
        teacherIds: pack.lesson.teacherIds || [],
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

  async function save() {
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
        note: form.note,
      } as never,
    });
    setSaving(false);
    if (!res.ok) {
      setError(("error" in res && res.error) || "AlfaCRM не приняла занятие.");
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
      customerIds: form.customerIds,
    });
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-[6vh]" onMouseDown={onClose}>
      <div className={cn("w-full max-w-lg p-5", RA_POP)} style={{ background: "#e8f3fc" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-fg">Групповое — занятие</h3>
          <button type="button" className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {loading || !form ? (
          <p className="mt-6 text-sm text-muted">{error || "Загружаю занятие из AlfaCRM…"}</p>
        ) : (
          <div className="mt-4 grid gap-3">
            <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
              Дата
              <input value={form.date} onChange={(e) => set("date", toYmd(e.target.value))} className={FIELD} />
            </label>
            <div className="grid grid-cols-[1fr_6.5rem_5.5rem] gap-2">
              <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                Время с
                <input
                  value={form.from}
                  onChange={(e) => {
                    const from = e.target.value;
                    setForm((f) => (f ? { ...f, from, to: addMins(from, f.duration) || f.to } : f));
                  }}
                  className={FIELD}
                />
              </label>
              <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                Мин
                <input
                  type="number"
                  value={form.duration}
                  onChange={(e) => {
                    const duration = Number(e.target.value) || 0;
                    setForm((f) => (f ? { ...f, duration, to: addMins(f.from, duration) || f.to } : f));
                  }}
                  className={FIELD}
                />
              </label>
              <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
                До
                <input value={form.to} readOnly className={cn(FIELD, "bg-white/70")} />
              </label>
            </div>
            <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
              Аудитория
              <RaSelect value={form.roomId ? String(form.roomId) : ""} placeholder="— не задана —" className={FIELD} options={rooms.map((r) => ({ value: String(r.id), label: r.name }))} onChange={(v) => set("roomId", Number(v) || 0)} />
            </label>
            <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
              Группа
              <RaSelect value={String(form.groupIds[0] || "")} placeholder="— группа —" className={FIELD} menuMinWidth={280} options={groups.map((g) => ({ value: String(g.id), label: g.name }))} onChange={(v) => set("groupIds", Number(v) ? [Number(v)] : [])} />
            </label>
            <div>
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">Клиент или лид</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {form.customers.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[0.75rem] ring-1 ring-black/8">
                    {c.name}
                    <button
                      type="button"
                      className="text-muted"
                      onClick={() => setForm((f) => (f ? { ...f, customerIds: f.customerIds.filter((id) => id !== c.id), customers: f.customers.filter((x) => x.id !== c.id) } : f))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="поиск клиента" className={FIELD} />
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
                            return { ...f, customerIds: [...f.customerIds, h.id], customers: [...f.customers, h] };
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
            </div>
            <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
              Предмет
              <RaSelect value={form.subjectId ? String(form.subjectId) : ""} placeholder="— предмет —" className={FIELD} menuMinWidth={280} options={subjects.map((s) => ({ value: String(s.id), label: s.name }))} onChange={(v) => set("subjectId", Number(v) || 0)} />
            </label>
            <div>
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">Педагог(и)</p>
              <div className={cn("mt-1 max-h-36 overflow-y-auto p-2", RA_POP)}>
                {teachers.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[0.8rem] hover:bg-black/[0.04]">
                    <input type="checkbox" checked={form.teacherIds.includes(t.id)} onChange={() => set("teacherIds", form.teacherIds.includes(t.id) ? form.teacherIds.filter((id) => id !== t.id) : [...form.teacherIds, t.id])} />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
            <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
              Тема
              <input value={form.topic} onChange={(e) => set("topic", e.target.value)} className={FIELD} />
            </label>
            <label className="block text-[0.62rem] font-medium uppercase tracking-[0.05em] text-muted/80">
              Комментарий
              <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} className="mt-1 w-full rounded-lg bg-white px-2.5 py-1.5 text-[0.8rem] font-medium text-fg ring-1 ring-black/[0.07] outline-none" />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="rounded-full bg-[#d8dce3] px-3 py-1 text-sm font-semibold text-[#5c636c]" onClick={onClose}>
                Отмена
              </button>
              <button type="button" disabled={saving} className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void save()}>
                {saving ? "Сохраняю…" : "Сохранить в AlfaCRM"}
              </button>
            </div>
          </div>
        )}
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
  onLessons,
}: {
  lessons: GroupCalLesson[];
  group?: string;
  subject?: string;
  teacher?: string;
  title?: string;
  className?: string;
  branchId?: number;
  groupId?: number;
  onLessons?: (next: GroupCalLesson[]) => void;
}) {
  const today = todayYmd();
  const [range, setRange] = useState<(typeof RANGE_OPTS)[number]["id"]>("10");
  const [tip, setTip] = useState<{ lesson: GroupCalLesson; top: number; left: number } | null>(null);
  const [pin, setPin] = useState<{ lesson: GroupCalLesson; top: number; left: number } | null>(null);
  const [edit, setEdit] = useState<GroupCalLesson | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      pool = all.filter((l) => l.date >= from && l.date <= to);
    }
    const pastAll = pool.filter((l) => l.date < today);
    const futureAll = pool.filter((l) => l.date > today);
    const todayHit = pool.find((l) => l.date === today) || null;
    if (range === "10") return { past: pastAll.slice(-10), future: futureAll.slice(0, 10), todayHit };
    return { past: pastAll, future: futureAll, todayHit };
  }, [all, range, today]);
  const shown = past.length + future.length + (todayHit ? 1 : 0);

  function place(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const width = 328;
    let left = r.right + 8;
    if (left + width > window.innerWidth - 8) left = Math.max(8, r.left - width - 8);
    if (left < 8) left = 8;
    let top = r.top;
    if (top + 320 > window.innerHeight) top = Math.max(8, window.innerHeight - 328);
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
          <LessonTile key={`${l.date}-${l.lessonId || l.from}`} lesson={l} today={today} onEnter={showTip} onLeave={hideTipSoon} onClick={clickTile} />
        ))}
        {todayHit ? (
          <LessonTile key={`${todayHit.date}-${todayHit.lessonId || todayHit.from}`} lesson={todayHit} today={today} onEnter={showTip} onLeave={hideTipSoon} onClick={clickTile} />
        ) : (
          <div className="ra-today-tile flex h-[3.35rem] w-[2.4rem] min-w-[2.4rem] flex-col items-center justify-center rounded-lg px-0.5 text-center text-white" title="Сегодня">
            <span className="text-[0.83rem] font-semibold tabular-nums">{Number(today.slice(8))}</span>
            <span className="text-[0.48rem] font-semibold uppercase leading-none tracking-wide text-white/95">сегодня</span>
            <span className="text-[0.6rem] font-medium text-white/90">{MONTHS_SHORT[Number(today.slice(5, 7)) - 1]}</span>
          </div>
        )}
        {future.map((l) => (
          <LessonTile key={`${l.date}-${l.lessonId || l.from}`} lesson={l} today={today} onEnter={showTip} onLeave={hideTipSoon} onClick={clickTile} />
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
                pinned={Boolean(pin)}
                busy={busy}
                error={error}
                onClose={() => {
                  setPin(null);
                  setError("");
                }}
                onOpen={branchId ? () => { setEdit(pop.lesson); setPin(null); setTip(null); } : undefined}
                onConduct={() => void setStatus(3)}
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
            groupId={groupId || 0}
            seed={edit}
            onClose={() => setEdit(null)}
            onSaved={(patch) => {
              if (edit.lessonId) patchLesson(edit.lessonId, patch);
              setEdit(null);
              setPin(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export { LessonStrip as GroupLessonStrip };

