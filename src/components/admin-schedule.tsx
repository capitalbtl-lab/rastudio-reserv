"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminSchedule } from "@/data/admin-schedule";
import { type CrmSlot } from "@/data/crm-slots-core";
import { Button } from "@/components/ui/button";
import { InfoTip, TipWrap } from "@/components/info-tip";
import { AdminSectionHead } from "@/components/admin-self-test";
import { SCHOOLS } from "@/data/site";
import { SCHOOL_ORDER } from "@/data/crm-slots-core";
import { cn } from "@/lib/utils";

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
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function place() {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 232;
    const h = Math.min(280, 28 + Math.max(1, names?.length || 1) * 20);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 10) top = Math.max(8, r.top - h - 8);
    let left = r.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    setPos({ top, left });
  }

  useEffect(() => {
    if (open) place();
  }, [open, names]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="whitespace-nowrap text-[0.7rem] font-semibold text-primary"
        onMouseEnter={() => {
          setOpen(true);
          place();
          onNeed();
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          setOpen(true);
          place();
          onNeed();
        }}
        onBlur={() => setOpen(false)}
      >
        Кто учится
      </button>
      {open
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[80] w-[14.5rem] rounded-md bg-neutral-600 px-2.5 py-2 text-left text-[0.72rem] leading-snug text-white shadow-md"
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
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [listen, setListen] = useState(false);
  const recRef = useRef<Rec | null>(null);

  function take(res: { ok: boolean; slots?: CrmSlot[]; at?: string; versions?: Ver[]; error?: string; comment?: string; changes?: Change[]; adds?: Draft[]; pushed?: number; created?: string[] }) {
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
    if (res.created?.length) {
      setDirty((d) => {
        const n = new Set(d);
        for (const id of res.created!) n.add(id);
        return n;
      });
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

  const tree = useMemo(() => {
    const map = new Map<string, Map<string, CrmSlot[]>>();
    const names = [...SCHOOLS.map((s) => s.label), "Прочее"];
    for (const name of names) map.set(name, new Map());
    for (const s of slots) {
      const school = names.includes(s.school) ? s.school : "Прочее";
      const course = s.course || s.subject || s.groupName || "Без названия";
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
    if (who[key] || !s.groupId) return;
    const res = await adminSchedule({ data: { token: token(), action: "students", groupId: s.groupId, branchId: s.branchId } });
    const names = res.ok && "names" in res && Array.isArray(res.names) ? (res.names as string[]) : [];
    setWho((prev) => ({ ...prev, [key]: names }));
  }

  const cell = "h-8 rounded-md bg-surface-2 px-1 text-center text-[0.75rem] leading-8 ring-1 ring-black/8";

  const coursesOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      if (!map.has(s.school)) map.set(s.school, []);
      if (s.course && !map.get(s.school)!.includes(s.course)) map.get(s.school)!.push(s.course);
    }
    return map;
  }, [slots]);
  const teachers = useMemo(() => [...new Set(slots.map((s) => s.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")), [slots]);

  function startListen() {
    const Ctor = speechCtor();
    if (!Ctor) {
      setMsg("Голосовой ввод в этом браузере не работает — напишите текст.");
      return;
    }
    recRef.current?.stop();
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const t = Array.from(e.results)
        .map((r) => r[0]?.transcript || "")
        .join(" ")
        .trim();
      if (t) setAiPrompt((p) => (p ? `${p} ${t}` : t));
    };
    rec.onerror = () => setListen(false);
    rec.onend = () => setListen(false);
    recRef.current = rec;
    setListen(true);
    rec.start();
  }

  function stopListen() {
    recRef.current?.stop();
    setListen(false);
  }

  return (
    <section className="mt-10 space-y-6">
      <AdminSectionHead
        section="schedule"
        title="Расписание из AlfaCRM"
        tip="Группы разложены по школам и курсам. Можно править прямо в таблице, сохранить на сайте, выгрузить в AlfaCRM, скачать Excel/CSV и накатить обратно. ИИ меняет пачкой — всегда есть откат к предыдущему снимку."
      >
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Последняя загрузка: {when(at)} · {slots.length} слотов · {dirty.size ? `${dirty.size} не выгружены в CRM` : "совпадает с кабинетом"}
        </p>
      </AdminSectionHead>

      <div className="flex flex-wrap items-start gap-2">
        <TipWrap text="group/index + regular-lesson/index + teacher/index по филиалам. Пишет снимок и версию для отката.">
          <Button type="button" disabled={busy} onClick={async () => { setMsg("Читаю группы, уроки и педагогов…"); await run("pull"); setDirty(new Set()); setMsg("Снимок с AlfaCRM на сайте."); }}>
            Загрузить из AlfaCRM
          </Button>
        </TipWrap>
        <TipWrap text="Пишет storage/crm-schedule.json. Посетитель видит новое расписание без выгрузки в CRM.">
          <Button type="button" disabled={busy || !slots.length} onClick={async () => { const res = await run("save", { slots }); if (res.ok) setMsg("Сохранено на сайте. Страницы курсов обновятся сразу. В CRM — отдельной кнопкой."); }}>
            Сохранить на сайте
          </Button>
        </TipWrap>
        <TipWrap text="Пишет group/update и regular-lesson/update. Если CRM отклонит поле — строка в ответе, остальные продолжат. Сначала сохраните на сайте.">
          <Button type="button" variant="secondary" disabled={busy || !slots.length} onClick={async () => { const res = await run("push", { slots, dirtyIds: [...dirty] }); const r = res as { pushed?: number }; setDirty(new Set()); setMsg(res.ok ? `В AlfaCRM ушло ${r.pushed ?? 0} групп (имя, день, время, педагог, лимит).` : ""); }}>
            Выгрузить в AlfaCRM
          </Button>
        </TipWrap>
        <Button type="button" variant="secondary" disabled={busy} onClick={async () => { const res = await run("exportXls"); if (res.ok && "text" in res) download(String(res.filename), String(res.mime), String(res.text)); }}>
          Excel
        </Button>
        <TipWrap text="Excel — SpreadsheetML. CSV — точка с запятой, UTF-8. Колонки: группа, предмет, возраст, день, время, филиал, ссылка записи, педагог.">
          <Button type="button" variant="secondary" disabled={busy} onClick={async () => { const res = await run("exportCsv"); if (res.ok && "text" in res) download(String(res.filename), String(res.mime), String(res.text)); }}>
            CSV
          </Button>
        </TipWrap>
        <TipWrap text="Из Excel: «Сохранить как» → CSV UTF-8, либо загрузите наш .xls обратно. Строки стыкуются по id.">
          <label className="inline-flex h-11 cursor-pointer items-center rounded-full bg-surface px-4 text-sm font-semibold shadow-[var(--shadow-border)]">
            Импорт Excel/CSV
            <input
              type="file"
              accept=".csv,.xls,.txt,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const text = await f.text();
                setBusy(true);
                const res = await adminSchedule({ data: { token: token(), action: "import", text } });
                take(res as never);
                setBusy(false);
                setDirty(new Set());
                if (res.ok) setMsg(`Импортировано. Проверьте школы и нажмите «Выгрузить в AlfaCRM», если нужно отдать в CRM.`);
              }}
            />
          </label>
        </TipWrap>
        <TipWrap text="Школа, курс, возраст, день, время, филиал, педагог — затем «Готово». Появится строка на сайте, в CRM — отдельной выгрузкой.">
          <Button type="button" disabled={busy} onClick={() => { setAddOpen((v) => !v); document.getElementById("ra-sched-ai")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            Добавить расписание
          </Button>
        </TipWrap>
        <TipWrap text="Текст или голос: добавить группу или поправить отмеченные. Филиалы и время ИИ приводит к тем же названиям, что в таблице.">
          <Button type="button" disabled={busy} onClick={() => document.getElementById("ra-sched-ai")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Добавить/исправить
          </Button>
        </TipWrap>
        <Button type="button" variant="secondary" onClick={() => setOpenAll((v) => !v)}>
          {openAll ? "Свернуть всё" : "Раскрыть всё"}
        </Button>
      </div>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <article id="ra-sched-ai" className="sticky top-20 z-20 rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-xl">Добавить / исправить расписание</p>
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
        <div className="mt-3 flex items-center gap-2">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={1}
            placeholder="Добавь художественную студию 5–6 лет на Гражданской, вторник с 6:30 до 8:00, педагог Самсонова."
            className="h-10 min-w-0 flex-1 resize-none rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-black/10"
          />
          <button
            type="button"
            title={listen ? "Стоп" : "Голосовой ввод"}
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10", listen ? "bg-primary text-white" : "bg-surface-2 text-fg")}
            onClick={() => (listen ? stopListen() : startListen())}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
            </svg>
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" disabled={busy || !aiPrompt.trim()} onClick={async () => { setMsg("Считаю правки…"); await run("aiPreview", { prompt: aiPrompt, ids: pickedIds }); }}>
            Показать, что изменится
          </Button>
          <Button type="button" disabled={busy || (!aiChanges.length && !aiAdds.length)} onClick={async () => { const res = await run("aiApply", { changes: aiChanges, adds: aiAdds, prompt: aiPrompt, ids: pickedIds }); if (res.ok) { setDirty((d) => { const n = new Set(d); for (const c of aiChanges) n.add(c.id); return n; }); setAiChanges([]); setAiAdds([]); setMsg("Применено на сайте. Новые группы в CRM — кнопкой «Выгрузить», когда появятся id."); } }}>
            Применить
          </Button>
        </div>
        {aiComment ? <p className="mt-2 text-sm text-muted">{aiComment}</p> : null}
        {aiAdds.length ? (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-sm">
            {aiAdds.map((a, i) => (
              <li key={`add-${i}`}>
                <span className="font-semibold text-primary">новая</span> · {a.course || a.school} · {["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][a.day] || a.day} {a.timeFrom}–{a.timeTo} · {a.branch} · {a.teacher || "педагог не указан"}
              </li>
            ))}
          </ul>
        ) : null}
        {aiChanges.length ? (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-sm">
            {aiChanges.map((c, i) => (
              <li key={`${c.id}-${c.field}-${i}`}>
                <span className="text-muted">{c.id}</span> · {c.field}: {c.from || "∅"} → {c.to}
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      {addOpen ? (
        <article className="rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
          <p className="font-display text-xl">Новая группа</p>
          <p className="mt-1 text-sm text-muted">Поля по порядку. «Готово» добавляет строку на сайт.</p>
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
              onClick={async () => {
                const res = await run("add", { draft });
                if (res.ok) {
                  setDraft(EMPTY_DRAFT);
                  setAddOpen(false);
                  setMsg("Группа добавлена на сайт. Выгрузите в AlfaCRM, когда будет готова карточка группы.");
                }
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
                            <col className="w-10" />
                            <col className="w-[7.5rem]" />
                            <col className="w-36" />
                            <col className="w-[4.4rem]" />
                            <col className="w-[5.5rem]" />
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
                            </tr>
                          </thead>
                          <tbody>
                            {c.items.map((s) => {
                              const key = `${s.branchId}-${s.groupId}`;
                              const names = who[key];
                              return (
                              <tr key={s.id} className={cn("border-t border-black/6", dirty.has(s.id) && "bg-primary/5")}>
                                <td className="px-2 py-1.5 align-middle">
                                  <CheckBox ids={[s.id]} picked={picked} onToggle={setIds} />
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                  <input
                                    value={s.groupName}
                                    title={s.groupName}
                                    onChange={(e) => patch(s.id, "groupName", e.target.value)}
                                    className="h-8 w-full min-w-[10rem] rounded-md bg-surface-2 px-2 text-[0.8rem] ring-1 ring-black/8"
                                  />
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <input value={s.age} onChange={(e) => patch(s.id, "age", e.target.value)} className={cn(cell, "w-full")} />
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <select value={s.day} onChange={(e) => patch(s.id, "day", Number(e.target.value))} className={cn(cell, "w-full px-0")}>
                                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                                      <option key={d} value={d}>
                                        {["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][d]}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-1 py-1.5 align-middle">
                                  <div className="flex items-center justify-center gap-1">
                                    <input value={s.timeFrom} onChange={(e) => patch(s.id, "timeFrom", e.target.value)} className={cn(cell, "w-[3.2rem]")} />
                                    <input value={s.timeTo} onChange={(e) => patch(s.id, "timeTo", e.target.value)} className={cn(cell, "w-[3.2rem]")} />
                                  </div>
                                </td>
                                <td className="px-1 py-1.5 text-center align-middle text-muted">{s.timesPerWeek}</td>
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
                              </tr>
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
                <p className="border-t border-black/6 px-5 py-4 text-sm text-muted">Расписание не заполнено.</p>
              )
            ) : null}
          </article>
          );
        })}
        {slots.length ? null : <p className="text-sm text-muted">Пока пусто — нажмите «Загрузить из AlfaCRM».</p>}
      </div>
    </section>
  );
}
