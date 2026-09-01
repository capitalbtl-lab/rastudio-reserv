"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminSchedule } from "@/data/admin-schedule";
import { type CrmSlot } from "@/data/crm-slots-core";
import { Button } from "@/components/ui/button";
import { InfoTip, TipWrap } from "@/components/info-tip";
import { AdminSectionHead } from "@/components/admin-self-test";
import { SCHOOLS } from "@/data/site";
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
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [who, setWho] = useState<Record<string, string[]>>({});

  function take(res: { ok: boolean; slots?: CrmSlot[]; at?: string; versions?: Ver[]; error?: string; comment?: string; changes?: Change[]; pushed?: number }) {
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return;
    }
    if (res.slots) setSlots(res.slots);
    if (res.at) setAt(res.at);
    if (res.versions) setVersions(res.versions);
    if (res.comment) setAiComment(res.comment);
    if (res.changes) setAiChanges(res.changes);
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
        <TipWrap text="Опишите правку обычным языком в блоке «Правка расписания». Сначала превью, потом применить. Создаётся версия — можно откатиться.">
          <Button type="button" disabled={busy} onClick={() => document.getElementById("ra-sched-ai")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Правка расписания
          </Button>
        </TipWrap>
        <Button type="button" variant="secondary" onClick={() => setOpenAll((v) => !v)}>
          {openAll ? "Свернуть всё" : "Раскрыть всё"}
        </Button>
      </div>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <article id="ra-sched-ai" className="sticky top-20 z-20 rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-xl">Правка расписания</p>
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
        <textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          rows={1}
          placeholder="Например: все группы художественной студии 5–6 на ЦМИТ перенеси на 17:00. Педагога не меняй."
          className="mt-3 h-10 w-full resize-none rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-black/10"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" disabled={busy || !aiPrompt.trim()} onClick={async () => { setMsg("Считаю правки…"); await run("aiPreview", { prompt: aiPrompt, ids: pickedIds }); }}>
            Показать, что изменится
          </Button>
          <Button type="button" disabled={busy || !aiChanges.length} onClick={async () => { const res = await run("aiApply", { changes: aiChanges, prompt: aiPrompt, ids: pickedIds }); if (res.ok) { setDirty(new Set(aiChanges.map((c) => c.id))); setAiChanges([]); setMsg("Правки только для отмеченных групп. Выгрузите в CRM, если нужно."); } }}>
            Применить
          </Button>
        </div>
        {aiComment ? <p className="mt-2 text-sm text-muted">{aiComment}</p> : null}
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
