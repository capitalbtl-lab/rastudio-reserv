"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { retryFetch } from "@/lib/retry-fetch";
import { loadFromDisk, pullFromCrm } from "@/lib/crm-pull";
import { CrmPullDialog, emptyPull, type CrmPullState } from "@/components/crm-pull-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CrmSubject } from "@/data/crm-subjects";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

type BranchCol = { id: number; name: string; short: string };
type Row = CrmSubject & {
  tariffTotal?: number;
  tariffByBranch?: Record<number, number>;
  tariffNames?: string[];
  courseId?: string;
  courseLabel?: string;
  schoolLabel?: string;
  groupByBranch?: Record<number, number>;
  groupTotal?: number;
  studentByBranch?: Record<number, number>;
  studentTotal?: number;
};
type SiteCourse = { id: string; label: string; schoolId: string; href?: string };
type SiteSchool = { id: string; label: string };
type Change = { id: number; field: string; from: string; to: string };

const FALLBACK: BranchCol[] = [
  { id: 2, name: "ЦМИТ, Октябрьской революции, 340", short: "ЦМИТ" },
  { id: 1, name: "Гражданская, 2", short: "Гражданская" },
  { id: 3, name: "Луховицы, Пушкина, 202А", short: "Луховицы" },
  { id: 4, name: "Летние программы", short: "Лето" },
];

const ORDER = [2, 1, 3, 4];

export function AdminSubjects() {
  const [items, setItems] = useState<Row[]>([]);
  const [branches, setBranches] = useState<BranchCol[]>(FALLBACK);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"with" | "without">("with");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiComment, setAiComment] = useState("");
  const [aiChanges, setAiChanges] = useState<Change[]>([]);
  const [aiAdds, setAiAdds] = useState<{ name: string }[]>([]);
  const [listen, setListen] = useState(false);
  const [pull, setPull] = useState<CrmPullState>(emptyPull("subjects"));
  const [schools, setSchools] = useState<SiteSchool[]>([]);
  const [courses, setCourses] = useState<SiteCourse[]>([]);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const dictBase = useRef("");

  async function loadLocal() {
    setBusy(true);
    try {
      const res = await retryFetch(() => loadFromDisk("subjects"));
      if (!res.ok) {
        setMsg(res.error || "Не удалось прочитать предметы с сайта.");
        return;
      }
      if ("subjects" in res && Array.isArray(res.subjects)) setItems(res.subjects as Row[]);
      if ("tree" in res && res.tree && typeof res.tree === "object") {
        const tree = res.tree as { schools?: SiteSchool[]; courses?: SiteCourse[] };
        if (tree.schools?.length) setSchools(tree.schools);
        if (tree.courses?.length) setCourses(tree.courses);
      }
      if ("tariffBranches" in res && Array.isArray(res.tariffBranches) && res.tariffBranches.length) {
        setBranches(
          [...(res.tariffBranches as BranchCol[])].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)),
        );
      }
      setMsg("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось загрузить предметы.");
    } finally {
      setBusy(false);
    }
  }

  async function run(
    action: "subjectsSave" | "subjectsPush" | "subjectsAiPreview" | "subjectsAiApply" | "subjectsBind",
    extra?: Record<string, unknown>,
  ) {
    setBusy(true);
    try {
      const mutate = action !== "subjectsAiPreview";
      const res = await retryFetch(
        () => adminSchedule({ data: { token: token(), action, ...extra } as never }),
        mutate ? 1 : 2,
        mutate ? 120000 : 30000,
      );
      if (!res.ok) {
        setMsg(res.error || "Ошибка");
        return res;
      }
      if ("subjects" in res && Array.isArray(res.subjects)) setItems(res.subjects as Row[]);
      if ("tree" in res && res.tree && typeof res.tree === "object") {
        const tree = res.tree as { schools?: SiteSchool[]; courses?: SiteCourse[] };
        if (tree.schools?.length) setSchools(tree.schools);
        if (tree.courses?.length) setCourses(tree.courses);
      }
      return res;
    } catch (e) {
      const fail = { ok: false as const, error: e instanceof Error ? e.message : "Не удалось выполнить действие." };
      setMsg(fail.error);
      return fail;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadLocal();
  }, []);

  function patch(id: number, field: "id" | "name", value: string) {
    setItems((list) =>
      list.map((s) => (s.id !== id ? s : { ...s, [field]: field === "id" ? Number(value) || 0 : value })),
    );
  }

  async function bindCourse(subjectId: number, courseId: string) {
    setItems((list) =>
      list.map((s) => {
        if (s.id !== subjectId) return s;
        const course = courses.find((c) => c.id === courseId);
        const school = course ? schools.find((x) => x.id === course.schoolId) : undefined;
        return { ...s, courseId, courseLabel: course?.label || "", schoolLabel: school?.label || "" };
      }),
    );
    const res = await run("subjectsBind", { subjectId, courseId });
    if (res?.ok) setMsg("Курс сайта записан. В AlfaCRM не уходил.");
  }

  function toggleDictation() {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => Rec;
      SpeechRecognition?: new () => Rec;
    };
    type Rec = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal?: boolean } & ArrayLike<{ transcript: string }>>;
      }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!SR) {
      setMsg("Голосовой ввод в этом браузере недоступен.");
      return;
    }
    if (listen && recRef.current) {
      recRef.current.stop();
      setListen(false);
      return;
    }
    dictBase.current = aiPrompt.trim();
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript || "";
        if (e.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      const spoken = (finalText || interim).replace(/\s+/g, " ").trim();
      setAiPrompt([dictBase.current, spoken].filter(Boolean).join(" "));
      if (finalText.trim()) dictBase.current = [dictBase.current, finalText.trim()].filter(Boolean).join(" ");
    };
    rec.onend = () => setListen(false);
    recRef.current = rec;
    rec.start();
    setListen(true);
  }

  async function previewAi() {
    if (!aiPrompt.trim()) return;
    const res = await run("subjectsAiPreview", { prompt: aiPrompt, ids: [...picked].map(String) });
    if (res.ok) {
      setAiComment(String(("comment" in res && res.comment) || ""));
      setAiChanges((("changes" in res && res.changes) || []) as Change[]);
      setAiAdds((("adds" in res && res.adds) || []) as { name: string }[]);
    }
  }

  const withTariff = items.filter((s) => Number(s.tariffTotal || 0) > 0);
  const withoutTariff = items.filter((s) => !Number(s.tariffTotal || 0));
  const view = useMemo(() => {
    const src = tab === "with" ? withTariff : withoutTariff;
    const needle = q.trim().toLowerCase();
    if (!needle) return src;
    return src.filter((s) => `${s.id} ${s.name} ${s.courseLabel || ""} ${s.schoolLabel || ""}`.toLowerCase().includes(needle));
  }, [tab, withTariff, withoutTariff, q]);

  const cols = (branches.length ? branches : FALLBACK).slice().sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const pickedInView = view.filter((s) => picked.has(s.id));

  return (
    <section className="space-y-4">
      <p className="max-w-3xl text-sm text-muted">
        Курс сайта подставляется из соответствий предмета и карточки группы. Справа — сколько живых групп и учеников с этим предметом в филиале. Загрузка берёт предметы из AlfaCRM и сразу подставляет курс сайта. Выгрузка отправляет в CRM только id и название — курс сайта на сайте остаётся.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setPull({ ...emptyPull("subjects"), open: true, step: "Подключаюсь к AlfaCRM…" });
            const st = await pullFromCrm("subjects", (step, lines, done, total) => {
              setPull((u) => (u.done ? u : { ...u, step: step || u.step, lines, added: done, total }));
            });
            if (!st.ok) {
              setPull((u) => ({ ...u, done: true, error: st.error || "AlfaCRM не ответила." }));
              return;
            }
            setPull({
              open: true,
              kind: "subjects",
              step: "",
              done: true,
              error: String((st as { error?: string }).error || ""),
              lines: ((st as { lines?: { ok: boolean; text: string }[] }).lines || []) as { ok: boolean; text: string }[],
              added: Number((st as { added?: number }).added || 0),
              updated: 0,
              total: Number((st as { total?: number }).total || 0),
            });
            await loadLocal();
          }}
        >
          Загрузить из AlfaCRM
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
          await run("subjectsSave", { subjects: items });
          setMsg("Справочник сохранён на сайте. Курсы сайта в CRM не уходили.");
        }}>
          Сохранить на сайте
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
          const list = picked.size ? items.filter((s) => picked.has(s.id)) : items;
          const res = await run("subjectsPush", { subjects: list });
          if (res?.ok) setMsg(picked.size ? `В AlfaCRM ушли названия выбранных: ${list.length}. Курс сайта не выгружается.` : "Названия выгружены в AlfaCRM. Курс сайта остался на сайте.");
        }}>
          Выгрузить в AlfaCRM{picked.size ? ` · ${picked.size}` : ""}
        </Button>
        <Button type="button" disabled={busy} onClick={() => setItems((list) => [...list, { id: 0, name: "", local: true, tariffTotal: 0, tariffByBranch: {} }])}>
          Добавить предмет
        </Button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="поиск" className="h-10 min-w-[10rem] flex-1 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-black/10" />
      </div>

      <article className="rounded-3xl bg-gradient-to-br from-[#e8f0ff] via-white to-[#eef4ff] p-4 ring-2 ring-primary/35 shadow-[0_10px_28px_rgba(32,94,220,0.18)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-xl text-primary">Добавить / исправить предметы</p>
          <div className="flex flex-wrap items-center gap-2 text-[0.72rem] text-muted">
            <span>отмечено {picked.size}</span>
            <button type="button" className="font-semibold text-primary" onClick={() => setPicked(new Set(view.map((s) => s.id)))}>Выделить всё</button>
            <button type="button" className="font-semibold text-primary" onClick={() => setPicked(new Set())}>Снять</button>
          </div>
        </div>
        <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">
          Галочками выберите предметы — помощник правит только их. Можно: «переименуй в Художественная студия (3–4 года)», «убери возраст из названия», «добавь предмет Основы граффити (10–14 лет)».
        </p>
        <div className="mt-3 flex items-start gap-2">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void previewAi();
              }
            }}
            placeholder="Переименуй выделенные: убери возраст из названия. Или: назови «Робототехника 7–9 лет»."
            className="min-h-10 min-w-0 flex-1 resize-none overflow-hidden rounded-xl bg-surface-2 px-3 py-2 text-sm leading-6 ring-1 ring-black/10"
          />
          <button
            type="button"
            title="Предпросмотр"
            disabled={busy || !aiPrompt.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
            onClick={() => void previewAi()}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h12M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button
            type="button"
            title="Голосовой ввод"
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10", listen ? "bg-primary text-white" : "bg-surface-2 text-fg")}
            onClick={toggleDictation}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>
          </button>
        </div>
        {aiComment && !aiChanges.length && !aiAdds.length ? <p className="mt-2 text-sm text-muted">{aiComment}</p> : null}
        {aiChanges.length || aiAdds.length ? (
          <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-black/8">
            <p className="text-sm font-semibold">Предпросмотр{aiComment ? ` · ${aiComment}` : ""}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {aiChanges.map((c, i) => (
                <li key={`${c.id}-${i}`}>
                  №{c.id}: {c.from} → <b>{c.to}</b>
                </li>
              ))}
              {aiAdds.map((a, i) => (
                <li key={`add-${i}`}>новый: {a.name}</li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-8 px-3 text-[0.78rem]" onClick={() => { setAiChanges([]); setAiAdds([]); }}>Отменить</Button>
              <Button type="button" className="h-8 px-3 text-[0.78rem]" disabled={busy} onClick={async () => {
                const res = await run("subjectsAiApply", {
                  changes: aiChanges.map((c) => ({ id: String(c.id), field: c.field, to: c.to })),
                  subjects: aiAdds,
                });
                if (res.ok) {
                  setAiChanges([]);
                  setAiAdds([]);
                  setAiPrompt("");
                  setMsg("Правки на сайте. Выгрузите в AlfaCRM, чтобы имена ушли в CRM.");
                }
              }}>Опубликовать изменения</Button>
            </div>
          </div>
        ) : null}
      </article>

      <div className="flex flex-wrap items-end gap-1 border-b border-black/10">
        <button type="button" onClick={() => setTab("with")} className={cn("rounded-t-xl px-5 py-2 text-sm font-semibold transition-colors", tab === "with" ? "bg-primary text-white" : "bg-surface-2 text-fg hover:bg-white")}>
          С абонементами
          <span className={cn("ml-1.5 text-[0.7rem] font-medium", tab === "with" ? "text-white/80" : "text-muted")}>{withTariff.length}</span>
        </button>
        <button type="button" onClick={() => setTab("without")} className={cn("rounded-t-xl px-5 py-2 text-sm font-semibold transition-colors", tab === "without" ? "bg-primary text-white" : "bg-surface-2 text-fg hover:bg-white")}>
          Без абонементов
          <span className={cn("ml-1.5 text-[0.7rem] font-medium", tab === "without" ? "text-white/80" : "text-muted")}>{withoutTariff.length}</span>
        </button>
      </div>

      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <div className="overflow-x-auto overflow-y-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead>
            <tr className="text-[0.7rem] font-medium uppercase tracking-wide text-muted">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={view.length > 0 && view.every((s) => picked.has(s.id))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(view.map((s) => s.id)) : new Set())}
                />
              </th>
              <th className="w-20 px-2 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Название предмета</th>
              <th className="w-[14rem] px-3 py-3 font-medium">Курс сайта</th>
              {cols.map((b) => (
                <th key={b.id} className="w-[6.5rem] px-2 py-3 text-center font-medium whitespace-nowrap">
                  {b.short}
                  <span className="mt-0.5 block text-[0.6rem] font-normal normal-case tracking-normal text-muted/80">гр / уч</span>
                </th>
              ))}
              <th className="w-[5.5rem] px-2 py-3 text-center font-medium whitespace-nowrap">
                Всего
                <span className="mt-0.5 block text-[0.6rem] font-normal normal-case tracking-normal text-muted/80">гр / уч</span>
              </th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {view.map((s) => (
              <tr key={`${s.id}-${s.name}`} className="border-t border-black/6">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => setPicked((set) => {
                    const n = new Set(set);
                    if (n.has(s.id)) n.delete(s.id);
                    else n.add(s.id);
                    return n;
                  })} />
                </td>
                <td className="px-2 py-2">
                  <input value={s.id || ""} onChange={(e) => patch(s.id, "id", e.target.value)} className="h-9 w-[4.5rem] rounded-xl bg-surface-2 px-2 text-center ring-1 ring-black/10" />
                </td>
                <td className="px-4 py-2">
                  <input value={s.name} onChange={(e) => patch(s.id, "name", e.target.value)} className="h-9 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={s.courseId || ""}
                    title="Курс сайта из соответствий. В AlfaCRM не уходит."
                    onChange={(e) => void bindCourse(s.id, e.target.value)}
                    className="h-9 w-full max-w-[14rem] rounded-[8px] bg-surface-2 px-2 text-[0.78rem] ring-1 ring-black/10"
                  >
                    <option value="">— курс сайта —</option>
                    {schools.map((sc) => (
                      <optgroup key={sc.id} label={sc.label}>
                        {courses
                          .filter((c) => c.schoolId === sc.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                    {s.courseId && !courses.some((c) => c.id === s.courseId) ? (
                      <option value={s.courseId}>{s.courseLabel || s.courseId}</option>
                    ) : null}
                  </select>
                </td>
                {cols.map((b) => {
                  const groups = Number(s.groupByBranch?.[b.id] || 0);
                  const students = Number(s.studentByBranch?.[b.id] || 0);
                  return (
                    <td key={b.id} className="px-2 py-2 text-center">
                      <Usage groups={groups} students={students} />
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center">
                  <Usage groups={Number(s.groupTotal || 0)} students={Number(s.studentTotal || 0)} strong />
                </td>
                <td className="px-2 py-2 text-center">
                  <button type="button" className="text-muted hover:text-red-600" onClick={() => setItems((list) => list.filter((x) => x.id !== s.id))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!view.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {busy ? "Читаю предметы с сайта…" : tab === "with" ? "Нет предметов с абонементами." : "Все предметы привязаны к абонементам."}
          </p>
        ) : null}
      </div>
      {pickedInView.length ? <p className="text-xs text-muted">В этой вкладке отмечено {pickedInView.length}.</p> : null}
      <CrmPullDialog pull={pull} onClose={() => setPull((u) => ({ ...u, open: false }))} />
    </section>
  );
}

function Usage({ groups, students, strong }: { groups: number; students: number; strong?: boolean }) {
  if (!groups && !students) {
    return <span className="inline-flex h-9 min-w-9 items-center justify-center text-muted/50">—</span>;
  }
  return (
    <span
      title={`${groups} групп · ${students} учеников`}
      className={cn(
        "inline-flex min-h-9 min-w-9 flex-col items-center justify-center rounded-[8px] px-2 leading-tight",
        strong ? "bg-sky-100 text-sky-900" : "bg-black/[0.04] text-fg",
      )}
    >
      <span className="text-sm font-semibold">{groups}</span>
      <span className={cn("text-[0.65rem]", strong ? "text-sky-800/80" : "text-muted")}>{students} уч</span>
    </span>
  );
}
