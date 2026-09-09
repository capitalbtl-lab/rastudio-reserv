"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { CRM_STAGE_COLORS, LEAD_STAGES, mergeStages, pinUnsorted, type LeadStage } from "@/data/crm-leads-stages";
import { FUNNEL_AUTO_DEFAULT, type FunnelAuto } from "@/data/funnel-auto-core";
import { CRM_BRANCH } from "@/data/ids";
import { cn } from "@/lib/utils";
import { CRM_ACTORS, actorLabel, actorOf, type CrmActorsState } from "@/data/crm-actors";
import { CACHE_KIND_META, type CacheKind, type CachePolicy } from "@/data/crm-cache-policy-core";
import { exportOpLabel, type CrmExportOp } from "@/data/crm-export-queue-core";
import { ALFA_LINK_MODES, ALFA_PULL_CH, ALFA_PUSH_CH, ALFA_PIPE_CH, ALFA_SYNC_DEFAULT, type AlfaLinkMode, type AlfaPullCh, type AlfaPushCh, type AlfaPipeCh } from "@/data/crm-alfa-link-core";
import { journalChunks, clampGrain, type Grain } from "@/data/crm-journal-periods";

function scrollRoot(from: HTMLElement | null): HTMLElement | Window {
  let n = from?.parentElement || null;
  while (n && n !== document.body) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return window;
}

function lockTabY(el: HTMLElement | null, prevTop: number) {
  if (!el) return;
  const dy = el.getBoundingClientRect().top - prevTop;
  if (Math.abs(dy) < 1) return;
  const root = scrollRoot(el);
  if (root === window) window.scrollBy(0, dy);
  else (root as HTMLElement).scrollTop += dy;
}

export const CRM_SYNC_MIN_KEY = "ra_crm_sync_min";

export function crmSyncMinutes() {
  if (typeof window === "undefined") return 10;
  const n = Number(localStorage.getItem(CRM_SYNC_MIN_KEY) || 10);
  return Number.isFinite(n) ? Math.max(2, Math.min(60, n)) : 10;
}

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

const BTN_LOAD =
  "inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-border)] hover:bg-primary-hover disabled:opacity-50";
const BTN_LOAD_SM =
  "inline-flex h-8 items-center justify-center truncate rounded-full bg-primary px-3 text-[0.78rem] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50";
const BTN_GHOST =
  "inline-flex h-10 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-black/10 hover:bg-primary/5 hover:ring-primary/25";
const BTN_GHOST_SM =
  "inline-flex h-8 items-center justify-center shrink-0 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10 hover:bg-primary/5 disabled:opacity-40";

function FillBar({ pct, run, done }: { pct: number; run?: boolean; done?: boolean }) {
  const w = run ? Math.max(18, Math.min(100, pct)) : Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-primary/12 ring-1 ring-primary/20">
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", run ? "ra-progress-run" : done ? "bg-emerald-500" : "bg-primary")}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.2rem] bg-white p-4 ring-1 ring-black/8 md:p-5">
      <h3 className="font-display text-[1.2rem] leading-tight">{title}</h3>
      {hint ? <p className="mt-1 text-[0.82rem] text-muted">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const CRM_SET_TABS = [
  { id: "people", label: "Люди и роли" },
  { id: "alfa", label: "Фон с AlfaCRM" },
  { id: "history", label: "История из Alfa" },
  { id: "queue", label: "Очередь" },
  { id: "funnel", label: "Воронка" },
  { id: "cache", label: "Кэш сайта" },
  { id: "branches", label: "Филиалы" },
] as const;
type CrmSetTab = (typeof CRM_SET_TABS)[number]["id"];
type HistTab = "groups" | "students" | "money";
const HIST_TABS: { id: HistTab; label: string }[] = [
  { id: "groups", label: "Занятия в группах" },
  { id: "students", label: "Календарь ученика" },
  { id: "money", label: "Деньги на карточке" },
];

type MissPack = {
  total: number;
  more?: number;
  items: { id?: number; name: string; extra?: string; groupId?: number; branchId?: number; school?: string; archived?: boolean }[];
};

type FillPart = { key: string; label: string; from?: string; to?: string; done?: boolean; weak?: boolean; rechecked?: boolean; lessons?: number; err?: string; at?: string; needDetails?: number; conducted?: number };

type FillRow = {
  groupId?: number;
  branchId?: number;
  name: string;
  school?: string;
  extra?: string;
  archived?: boolean;
  lessons?: number;
  done?: number;
  total?: number;
  next?: string;
  nextKey?: string;
  from?: string;
  weight?: string;
  err?: string;
  complete?: boolean;
  age?: string;
  ageLabel?: string;
  life?: string;
  source?: string;
  parts?: FillPart[];
};

function ruAt(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function packGrain(parts: FillPart[] | undefined, grain: Grain) {
  const list = parts || [];
  const byKey = new Map(list.map((p) => [p.key, p]));
  const have = new Set(list.map((p) => p.key));
  return journalChunks(grain)
    .filter((c) => c.keys.some((k) => have.has(k)))
    .map((c) => {
      const kids = c.keys.map((k) => byKey.get(k)).filter(Boolean) as FillPart[];
      const present = c.keys.filter((k) => have.has(k));
      const done = present.every((k) => byKey.get(k)?.done);
      const weak = present.some((k) => byKey.get(k)?.weak);
      const rechecked = present.length > 0 && present.every((k) => byKey.get(k)?.rechecked);
      const lessons = kids.reduce((s, p) => s + (p.lessons || 0), 0);
      const needDetails = kids.reduce((s, p) => s + (p.needDetails || 0), 0);
      const conducted = kids.reduce((s, p) => s + (p.conducted || 0), 0);
      const at = kids.map((p) => p.at).filter(Boolean).sort().at(-1) || "";
      const err = kids.find((p) => p.err)?.err || "";
      return { key: c.key, label: c.label, from: c.from, to: c.to, done, weak, rechecked, lessons, err, at, needDetails, conducted };
    });
}

function CheckLine({ on, text }: { on: boolean; text: string }) {
  return (
    <span className={cn("block", on ? "text-emerald-900" : "text-muted")}>
      {on ? "☑ " : "☐ "}
      {text}
    </span>
  );
}

const DETAIL_FIELDS = ["домашнее задание", "тема", "комментарий", "таблица учеников"] as const;

function DetailsFields({ on, extra }: { on: boolean; extra?: string }) {
  return (
    <>
      {DETAIL_FIELDS.map((t, i) => (
        <CheckLine key={t} on={on} text={i === DETAIL_FIELDS.length - 1 && extra ? `${t} · ${extra}` : t} />
      ))}
    </>
  );
}

function fillFinished(chunks: FillPart[]) {
  return chunks.length > 0 && chunks.every((c) => c.done && !c.weak && !(c.needDetails || 0));
}

function fillFinishedRow(row: FillRow, grain: Grain) {
  return fillFinished(packGrain(row.parts, clampGrain(row.age, grain)));
}

function nextRecheckPart(row: FillRow, grain: Grain) {
  const chunks = packGrain(row.parts, clampGrain(row.age, grain));
  const hole = chunks.find((c) => !c.done || c.weak);
  if (hole) return hole;
  return [...chunks].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")))[0] || chunks[0] || null;
}

function nextWizard(chunks: FillPart[]) {
  const load = chunks.find((c) => !c.done || c.weak);
  if (load) {
    return {
      kind: "load" as const,
      part: load,
      step: "Шаг 1 · загрузить явки",
      btn: load.weak ? `Загрузить ещё раз ${load.label}` : `Загрузить ${load.label}`,
    };
  }
  const detailsLeft = chunks.reduce((s, c) => s + (c.needDetails || 0), 0);
  if (detailsLeft > 0) {
    return {
      kind: "details" as const,
      part: chunks.find((c) => (c.needDetails || 0) > 0),
      step: "Шаг 2 · тема, ДЗ, комментарий, таблица учеников",
      btn: `Загрузить тему, ДЗ, комментарий и таблицу учеников всех кварталов · ${detailsLeft}`,
    };
  }
  return {
    kind: "done" as const,
    part: chunks[0] || null,
    step: "Все явки, тема, ДЗ, комментарий и таблица учеников на месте",
    btn: chunks.length ? `Перепроверить все кварталы · ${chunks.length}` : "Готово",
  };
}

function GroupFillList({
  rows,
  school,
  busy,
  loading,
  grain,
  onLoad,
  onRecheck,
  onRecheckAll,
  onStop,
  onDetails,
}: {
  rows: FillRow[];
  school: string;
  busy?: boolean;
  loading?: { groupId?: number; branchId?: number; periodKey?: string; label?: string; kind?: string };
  grain: Grain;
  onLoad: (row: FillRow, part: FillPart, recheck?: boolean) => void;
  onRecheck: (row: FillRow, part: FillPart) => void;
  onRecheckAll: (row: FillRow) => void;
  onStop?: () => void;
  onDetails: (row: FillRow, part?: FillPart) => void;
}) {
  const [open, setOpen] = useState("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [pageNeed, setPageNeed] = useState(0);
  const [pageDone, setPageDone] = useState(0);
  const q = query.trim().toLowerCase();
  const scoped = rows.filter((r) => {
    if (school && r.school !== school) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || String(r.school || "").toLowerCase().includes(q);
  });
  const needRows = scoped.filter((r) => !fillFinishedRow(r, grain));
  const doneRows = scoped.filter((r) => fillFinishedRow(r, grain));
  const nNeed = needRows.length;
  const nDone = doneRows.length;
  const pagesNeed = Math.max(1, Math.ceil(nNeed / pageSize) || 1);
  const pagesDone = Math.max(1, Math.ceil(nDone / pageSize) || 1);
  const safeNeed = Math.min(pageNeed, pagesNeed - 1);
  const safeDone = Math.min(pageDone, pagesDone - 1);
  const listNeed = needRows.slice(safeNeed * pageSize, safeNeed * pageSize + pageSize);
  const listDone = doneRows.slice(safeDone * pageSize, safeDone * pageSize + pageSize);
  useEffect(() => {
    setPageNeed(0);
    setPageDone(0);
  }, [q, school, pageSize]);
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem("crm-journal-page") || 20);
      if (n === 10 || n === 20 || n === 30 || n === 100) setPageSize(n);
    } catch {
      /* */
    }
  }, []);
  function pickPageSize(n: number) {
    setPageSize(n);
    setPageNeed(0);
    setPageDone(0);
    try {
      localStorage.setItem("crm-journal-page", String(n));
    } catch {
      /* */
    }
  }
  function toggleOpen(id: string) {
    setOpen((cur) => (cur === id ? "" : id));
  }
  function pager(page: number, pages: number, onPage: (n: number) => void) {
    if (pages <= 1) return null;
    return (
      <span className="ml-auto flex flex-wrap items-center gap-1">
        <button type="button" className="h-8 rounded-full bg-white px-3 font-semibold ring-1 ring-black/10 disabled:opacity-40" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Назад
        </button>
        {Array.from({ length: pages }, (_, i) => i).map((i) => (
          <button key={i} type="button" className={cn("h-8 min-w-8 rounded-full px-2 font-semibold", i === page ? "bg-black text-white" : "bg-white ring-1 ring-black/10")} onClick={() => onPage(i)}>
            {i + 1}
          </button>
        ))}
        <button type="button" className="h-8 rounded-full bg-white px-3 font-semibold ring-1 ring-black/10 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Дальше
        </button>
      </span>
    );
  }
  function renderGroup(row: FillRow) {
          const id = `${row.branchId}-${row.groupId}`;
          const useGrain = clampGrain(row.age, grain);
          const chunks = packGrain(row.parts, useGrain);
          const doneN = chunks.filter((c) => c.done).length;
          const total = chunks.length;
          const pct = total > 0 ? Math.min(100, Math.round((doneN / total) * 100)) : 0;
          const active = loading && loading.groupId === row.groupId && loading.branchId === row.branchId;
          const full = fillFinished(chunks);
          const shown = open === id;
          const wiz = nextWizard(chunks);
          const detailsLeft = chunks.reduce((s, c) => s + (c.needDetails || 0), 0);
          const loadKind = active ? loading?.kind || "group" : "";
          const loadLabel = active ? loading?.label || chunks.find((c) => c.key === loading?.periodKey)?.label || wiz.part?.label || "" : "";
          return (
            <li key={id} data-gid={id} className={cn("rounded-2xl bg-white p-3 ring-1", full ? "ring-emerald-300" : active ? "ring-primary" : "ring-black/8")}>
              <button type="button" className="w-full text-left" onClick={() => toggleOpen(id)}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{row.name}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {row.ageLabel ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.72rem] font-semibold",
                          row.age === "young" ? "bg-sky-100 text-sky-900" : row.age === "old" ? "bg-zinc-200 text-zinc-800" : row.age === "mid" ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900",
                        )}
                      >
                        {row.ageLabel}
                      </span>
                    ) : null}
                    {full ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.72rem] font-semibold text-emerald-900">загрузка завершена</span>
                    ) : (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[0.72rem] font-semibold text-rose-900">
                        требуют загрузки{total ? ` · ${doneN}/${total}` : ""}
                      </span>
                    )}
                    {detailsLeft > 0 ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.72rem] font-semibold text-violet-900">без темы/ДЗ · {detailsLeft}</span>
                    ) : null}
                  </span>
                </div>
                <FillBar pct={pct} run={active} done={full} />
                <p className="mt-1 h-4 truncate text-[0.72rem] text-muted">
                  {active ? `загрузка · ${loadLabel}` : [row.life ? `срок ${row.life}` : "", row.from].filter(Boolean).join(" · ")}
                  {!active && row.lessons ? ` · ${row.lessons} зан.` : ""}
                  {!active && row.weight ? ` · ${row.weight}` : ""}
                  {row.archived ? " · архив" : ""}
                </p>
              </button>
              <p className="mt-2 h-5 truncate text-[0.78rem] font-semibold">{active ? `загрузка · ${loadLabel}` : wiz.step}</p>
              <div className="mt-1 flex h-8 items-center gap-2">
                <button
                  type="button"
                  disabled={busy && !active}
                  className={cn(BTN_LOAD_SM, "w-fit shrink-0 px-4", active && "ra-progress-run")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (wiz.kind === "load" && wiz.part) onLoad(row, wiz.part, Boolean(wiz.part.done || wiz.part.weak));
                    else if (wiz.kind === "details") onDetails(row);
                    else onRecheckAll(row);
                  }}
                >
                  {active ? `загрузка · ${loadLabel}` : wiz.btn}
                </button>
                <button
                  type="button"
                  disabled={!active}
                  className={BTN_GHOST_SM}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop?.();
                  }}
                >
                  Стоп
                </button>
              </div>
              {shown ? (
                <div className="mt-2 grid items-start gap-1 sm:grid-cols-2">
                  {chunks.map((c) => {
                    const spinJ = active && loadKind !== "details" && loading?.periodKey === c.key;
                    const spinD = active && loadKind === "details" && (!loading?.periodKey || loading.periodKey === c.key);
                    const loaded = Boolean(c.done);
                    const verified = Boolean(c.rechecked);
                    const detailsOk = loaded && !(c.needDetails || 0);
                    const noHw = loaded && (c.conducted || 0) === 0 && !(c.needDetails || 0);
                    const status = spinJ || spinD ? "загрузка…" : detailsOk && (verified || loaded) ? "готово" : loaded ? "отмечено" : "";
                    return (
                      <div
                        key={c.key}
                        className={cn(
                          "flex min-h-[17.5rem] flex-col rounded-xl px-2.5 py-2 ring-1",
                          c.weak ? "bg-amber-50 ring-amber-300" : loaded ? "bg-emerald-50 ring-emerald-200" : spinJ || spinD ? "bg-primary/8 ring-primary" : "bg-white ring-black/10",
                        )}
                      >
                        <p className="font-medium text-sm">{c.label}</p>
                        <p className="h-4 text-[0.72rem] font-semibold text-black">{status}</p>
                        <div className="text-[0.72rem] leading-snug">
                          <CheckLine on={loaded} text={`${c.label} загружен`} />
                          <CheckLine on={verified} text={`${c.label} перепроверен`} />
                          <CheckLine on={verified} text="в этом квартале дубликатов нет" />
                          <span className="mt-1 block font-medium text-muted">по каждому уроку:</span>
                          <DetailsFields
                            on={detailsOk}
                            extra={noHw ? "грузить нечего" : !detailsOk && c.needDetails ? `осталось ${c.needDetails}` : undefined}
                          />
                        </div>
                        <p className="mt-auto h-4 truncate pt-1 text-[0.72rem] text-muted">
                          {c.weak ? "пакет оборвался" : c.err && !c.done ? c.err : c.lessons ? `${c.lessons} зан.` : loaded ? "занятий за квартал нет" : "ещё не загружали"}
                          {c.at ? ` · ${ruAt(c.at)}` : ""}
                        </p>
                        <div className="flex flex-col items-start gap-1 pt-1">
                          <button
                            type="button"
                            disabled={busy && !spinJ}
                            className={cn(
                              "h-8 w-fit rounded-full px-4 text-[0.78rem] font-semibold disabled:opacity-50",
                              spinJ ? "ra-progress-run text-white" : !loaded || c.weak ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "bg-white text-fg ring-1 ring-black/10 hover:bg-primary/5",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoad(row, c, Boolean(loaded || c.weak));
                            }}
                          >
                            {spinJ ? "загрузка…" : !loaded || c.weak ? `Загрузить явки · ${c.label}` : `Перепроверить явки · ${c.label}`}
                          </button>
                          <button
                            type="button"
                            disabled={!loaded || detailsOk || noHw || (busy && !spinD)}
                            className={cn(
                              "h-8 w-fit rounded-full px-4 text-[0.78rem] font-semibold disabled:opacity-40",
                              spinD
                                ? "ra-progress-run text-white"
                                : detailsOk || noHw
                                  ? "bg-white text-muted ring-1 ring-black/10"
                                  : loaded
                                    ? "bg-primary/12 text-primary ring-1 ring-primary/35 hover:bg-primary hover:text-white"
                                    : "bg-white text-muted ring-1 ring-black/10",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDetails(row, c);
                            }}
                          >
                            {spinD
                              ? "загрузка…"
                              : detailsOk || noHw
                                ? "готово"
                                : loaded
                                  ? `Загрузить детали · ${c.needDetails || 0}`
                                  : "Сначала явки"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
  }

  if (!scoped.length) return <p className="mt-3 text-sm text-muted">Нет групп в этом фильтре.</p>;
  return (
    <div className="mt-3">
      <input
        className="h-9 w-full rounded-full bg-white px-3 text-sm ring-1 ring-black/10"
        placeholder="Найти группу…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.78rem]">
        <span className="text-muted">На странице</span>
        {([10, 20, 30, 100] as const).map((n) => (
          <button
            key={n}
            type="button"
            className={cn("h-8 rounded-full px-3 font-semibold", pageSize === n ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
            onClick={() => pickPageSize(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
        <section className="rounded-2xl bg-white/70 p-3 ring-1 ring-rose-200">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-rose-900">Требуют загрузки данных · {nNeed}</h4>
            {pager(safeNeed, pagesNeed, setPageNeed)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">Явки, тема, ДЗ, комментарий и таблица учеников — пока чего-то нет, группа здесь.</p>
          {listNeed.length ? <ul className="mt-2 space-y-2 [overflow-anchor:none]">{listNeed.map(renderGroup)}</ul> : <p className="mt-3 text-sm text-muted">Все группы этой школы уже загружены.</p>}
        </section>
        <section className="rounded-2xl bg-white/70 p-3 ring-1 ring-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[1.05rem] text-emerald-900">Загрузка данных завершена · {nDone}</h4>
            {pager(safeDone, pagesDone, setPageDone)}
          </div>
          <p className="mt-1 text-[0.72rem] text-muted">Каждый квартал: явки есть, тема/ДЗ/комментарий/таблица на месте, пакет не оборвался.</p>
          {listDone.length ? <ul className="mt-2 space-y-2 [overflow-anchor:none]">{listDone.map(renderGroup)}</ul> : <p className="mt-3 text-sm text-muted">Пока ни одна группа не загружена до конца.</p>}
        </section>
      </div>
    </div>
  );
}

function MissList({
  pack,
  empty,
  onGroup,
}: {
  pack?: MissPack;
  empty: string;
  onGroup?: (row: MissPack["items"][number]) => void;
}) {
  if (!pack || !pack.total) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <div className="mt-2">
      <ul className="max-h-48 space-y-0.5 overflow-auto text-sm">
        {pack.items.map((row) => {
          const gid = Number(row.groupId) || 0;
          return (
            <li key={`${gid || row.id}:${row.branchId || 0}:${row.name}`}>
              {gid && onGroup ? (
                <button type="button" className="w-full rounded-lg px-2 py-1 text-left hover:bg-black/5" onClick={() => onGroup(row)}>
                  <span className="font-medium">{row.name}</span>
                  {row.school ? <span className="ml-1.5 text-[0.72rem] text-muted">{row.school}</span> : null}
                  {row.extra ? <span className="ml-1.5 text-[0.72rem] text-rose-800">{row.extra}</span> : null}
                </button>
              ) : (
                <span className="block px-2 py-1">
                  <span className="font-medium">{row.name}</span>
                  {row.extra ? <span className="ml-1.5 text-[0.72rem] text-rose-800">{row.extra}</span> : null}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {pack.more ? <p className="mt-1 px-2 text-[0.72rem] text-muted">и ещё {pack.more} — после загрузки список станет короче</p> : null}
    </div>
  );
}

function ProgressBar({ done, total, run }: { done: number; total: number; run?: boolean }) {
  const left = Math.max(0, total - done);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="mt-2">
      <p className="font-display text-xl tabular-nums leading-none">
        {total <= 0 ? (
          <span className="font-semibold text-muted">нет на диске</span>
        ) : (
          <>
            <span className="font-semibold text-primary">{done} загрузка завершена</span>
            <span className="mx-2 text-muted">·</span>
            <span className={left ? "font-semibold text-rose-800" : "text-muted"}>{left ? `${left} требуют загрузки` : "всё есть"}</span>
          </>
        )}
      </p>
      <FillBar pct={pct} run={run} done={!left && total > 0} />
    </div>
  );
}

export function AdminCrmSettings() {
  const [stages, setStages] = useState<LeadStage[]>(LEAD_STAGES);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [addName, setAddName] = useState("");
  const [addColor, setAddColor] = useState("#1a7bb9");
  const [syncMin, setSyncMin] = useState(10);
  const [auto, setAuto] = useState<FunnelAuto>(FUNNEL_AUTO_DEFAULT);
  const [cache, setCache] = useState<CachePolicy | null>(null);
  const [actors, setActors] = useState<CrmActorsState | null>(null);
  const [humanName, setHumanName] = useState("Администратор");
  const [alfaMode, setAlfaMode] = useState<AlfaLinkMode>("linked");
  const [pull, setPull] = useState(ALFA_SYNC_DEFAULT.pull);
  const [push, setPush] = useState(ALFA_SYNC_DEFAULT.push);
  const [pipe, setPipe] = useState(ALFA_SYNC_DEFAULT.pipe);
  const [payDays, setPayDays] = useState(ALFA_SYNC_DEFAULT.payDays);
  const [queue, setQueue] = useState<{
    pending?: number;
    lastNote?: string;
    overlayNext?: number;
    overlayTotal?: number;
    busy?: boolean;
    exportPending?: number;
    exportBusy?: boolean;
    exportNote?: string;
    jobs?: { op: string; entityId: number; actor?: string; tries?: number }[];
  } | null>(null);
  const [journal, setJournal] = useState<{
    note?: string;
    at?: string;
    extra?: string;
    error?: string;
    more?: boolean;
    groups?: { groupId: number; branchId: number; name: string; school: string; taken?: number; archived?: boolean }[];
    schools?: { name: string; groups: number }[];
    journalNext?: number;
    journalTotal?: number;
    lessonsNext?: number;
    lessonsTotal?: number;
    students?: { all: number; live: number; archive: number };
    linked?: boolean;
    progress?: {
      groups?: { total: number; done: number; periods?: number; miss?: MissPack; doneList?: MissPack; rows?: FillRow[] };
      live?: { total: number; journalDone: number; cardDone: number; missJournal?: MissPack; missCard?: MissPack };
      archive?: { total: number; journalDone: number; cardDone: number; missJournal?: MissPack; missCard?: MissPack };
    };
    lastLife?: {
      at?: string;
      school?: string;
      total: number;
      young: number;
      mid: number;
      old: number;
      unknown: number;
      youngNames?: string[];
      midNames?: string[];
      oldNames?: string[];
      unknownNames?: string[];
      probed?: number;
      left?: number;
    } | null;
  } | null>(null);
  const [journalSchool, setJournalSchool] = useState("");
  const [journalGrain, setJournalGrain] = useState<Grain>("quarter");
  const [crmTab, setCrmTab] = useState<CrmSetTab>("history");
  const [histTab, setHistTab] = useState<HistTab>("groups");
  const crmTabsRef = useRef<HTMLDivElement>(null);
  const histTabsRef = useRef<HTMLDivElement>(null);
  const tabLockY = useRef<number | null>(null);
  const tabLockKind = useRef<"crm" | "hist" | null>(null);
  const [openMiss, setOpenMiss] = useState<"g" | "j1" | "j2" | "c1" | "c2" | "">("");
  const [fillLoading, setFillLoading] = useState<{ groupId?: number; branchId?: number; periodKey?: string; label?: string; kind?: string } | null>(null);
  const stopSchool = useRef(false);
  const [schoolRun, setSchoolRun] = useState<{ cur: string; n: number; total: number } | null>(null);
  const dragId = useRef(0);
  useEffect(() => {
    try {
      const s = localStorage.getItem("crm-journal-school") || "";
      const g = localStorage.getItem("crm-journal-grain") || "";
      const t = localStorage.getItem("crm-settings-tab") || "";
      const h = localStorage.getItem("crm-history-tab") || "";
      if (s) setJournalSchool(s);
      if (g === "quarter" || g === "half" || g === "year") setJournalGrain(g);
      if (CRM_SET_TABS.some((x) => x.id === t)) setCrmTab(t as CrmSetTab);
      if (h === "groups" || h === "students" || h === "money") setHistTab(h);
    } catch {
      /* */
    }
  }, []);

  function pickCrmTab(v: CrmSetTab) {
    tabLockY.current = crmTabsRef.current?.getBoundingClientRect().top ?? null;
    tabLockKind.current = "crm";
    setCrmTab(v);
    try {
      localStorage.setItem("crm-settings-tab", v);
    } catch {
      /* */
    }
  }

  function pickHistTab(v: HistTab) {
    tabLockY.current = histTabsRef.current?.getBoundingClientRect().top ?? crmTabsRef.current?.getBoundingClientRect().top ?? null;
    tabLockKind.current = "hist";
    setHistTab(v);
    try {
      localStorage.setItem("crm-history-tab", v);
    } catch {
      /* */
    }
  }

  useLayoutEffect(() => {
    const y = tabLockY.current;
    const kind = tabLockKind.current;
    tabLockY.current = null;
    tabLockKind.current = null;
    if (y == null) return;
    lockTabY(kind === "hist" ? histTabsRef.current || crmTabsRef.current : crmTabsRef.current, y);
  }, [crmTab, histTab]);

  function pickJournalSchool(v: string) {
    setJournalSchool(v);
    try {
      localStorage.setItem("crm-journal-school", v);
    } catch {
      /* */
    }
  }

  function pickJournalGrain(v: Grain) {
    setJournalGrain(v);
    try {
      localStorage.setItem("crm-journal-grain", v);
    } catch {
      /* */
    }
  }

  function applyLink(link: {
    mode?: AlfaLinkMode;
    pull?: typeof pull;
    push?: typeof push;
    pipe?: typeof pipe;
    minutes?: number;
    payDays?: number;
  }) {
    setAlfaMode(link.mode === "offline" ? "offline" : "linked");
    if (link.pull) setPull({ ...ALFA_SYNC_DEFAULT.pull, ...link.pull });
    if (link.push) setPush({ ...ALFA_SYNC_DEFAULT.push, ...link.push });
    if (link.pipe) setPipe({ ...ALFA_SYNC_DEFAULT.pipe, ...link.pipe });
    if (link.minutes) {
      setSyncMin(link.minutes);
      try {
        localStorage.setItem(CRM_SYNC_MIN_KEY, String(link.minutes));
      } catch {
        /* */
      }
    }
    if (link.payDays) setPayDays(link.payDays);
  }

  useEffect(() => {
    setSyncMin(crmSyncMinutes());
    void loadStages();
    void loadAuto();
    void loadCache();
    void loadActors();
    void loadJournal();
  }, []);

  async function loadAuto() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "funnelAutoGet" } as never,
      })) as { ok?: boolean; rules?: FunnelAuto };
      if (res.ok && res.rules) setAuto(res.rules);
    } catch {
      /* defaults */
    }
  }

  async function saveAuto(next: FunnelAuto) {
    setAuto(next);
    const res = (await adminSchedule({
      data: { token: token(), action: "funnelAutoSave", funnelAuto: next } as never,
    })) as { ok?: boolean; rules?: FunnelAuto; error?: string };
    if (res.ok && res.rules) {
      setAuto(res.rules);
      setMsg("Автоматизация записана.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить автоматизацию.");
  }

  async function loadCache() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "cachePolicyGet" } as never,
      })) as { ok?: boolean; policy?: CachePolicy; queue?: typeof queue; alfaLink?: { mode?: AlfaLinkMode; pull?: typeof pull; push?: typeof push; pipe?: typeof pipe; minutes?: number; payDays?: number } };
      if (res.ok && res.policy) setCache(res.policy);
      if (res.ok && res.queue) setQueue(res.queue);
      if (res.ok && res.alfaLink) applyLink(res.alfaLink);
    } catch {
      /* defaults */
    }
  }

  async function saveCache(next: CachePolicy) {
    setCache(next);
    const res = (await adminSchedule({
      data: { token: token(), action: "cachePolicySave", cachePolicy: next } as never,
    })) as { ok?: boolean; policy?: CachePolicy; error?: string };
    if (res.ok && res.policy) {
      setCache(res.policy);
      setMsg("Кэш сайта записан.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить кэш.");
  }

  async function loadActors() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "actorsGet" } as never,
      })) as { ok?: boolean; humanName?: string; actors?: CrmActorsState["actors"] };
      if (res.ok) {
        setActors({
          humanName: res.humanName || "Администратор",
          actors: res.actors?.length ? res.actors : CRM_ACTORS,
        });
        setHumanName(res.humanName || "Администратор");
      }
    } catch {
      setActors({ humanName: "Администратор", actors: CRM_ACTORS });
    }
  }

  async function saveActorsName() {
    const res = (await adminSchedule({
      data: { token: token(), action: "actorsSave", humanName } as never,
    })) as { ok?: boolean; humanName?: string; actors?: CrmActorsState["actors"]; error?: string };
    if (res.ok) {
      setActors({ humanName: res.humanName || humanName, actors: res.actors?.length ? res.actors : CRM_ACTORS });
      setMsg("Роли записаны.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить роли.");
  }

  async function saveAlfaMode(mode: AlfaLinkMode) {
    setAlfaMode(mode);
    setBusy(true);
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "alfaLinkSave", alfaLink: { mode, pull, push, pipe, minutes: syncMin, payDays } } as never,
      })) as { ok?: boolean; alfaLink?: { mode?: AlfaLinkMode; pull?: typeof pull; push?: typeof push; pipe?: typeof pipe; minutes?: number; payDays?: number }; error?: string };
      if (!res.ok) {
        setMsg(res.error || "Не удалось сменить связь с Alfa.");
        return;
      }
      if (res.alfaLink) applyLink(res.alfaLink);
      setMsg(mode === "offline" ? "Без AlfaCRM: очередь копит, в CRM не уходит. Ольга пишет на диск." : "Фон с AlfaCRM: очередь выгружает по включённым каналам.");
      if (mode === "linked") await tickQueue(false);
      else await loadCache();
    } finally {
      setBusy(false);
    }
  }

  async function saveSync(next: { pull?: typeof pull; push?: typeof push; pipe?: typeof pipe; minutes?: number; payDays?: number }) {
    if (next.pull) setPull(next.pull);
    if (next.push) setPush(next.push);
    if (next.pipe) setPipe(next.pipe);
    if (next.minutes) setSyncMin(next.minutes);
    if (next.payDays) setPayDays(next.payDays);
    const res = (await adminSchedule({
      data: {
        token: token(),
        action: "alfaLinkSave",
        alfaLink: {
          mode: alfaMode,
          pull: next.pull || pull,
          push: next.push || push,
          pipe: next.pipe || pipe,
          minutes: next.minutes || syncMin,
          payDays: next.payDays || payDays,
        },
      } as never,
    })) as { ok?: boolean; alfaLink?: { mode?: AlfaLinkMode; pull?: typeof pull; push?: typeof push; pipe?: typeof pipe; minutes?: number; payDays?: number }; error?: string };
    if (!res.ok) {
      setMsg(res.error || "Не удалось сохранить каналы Alfa.");
      return;
    }
    if (res.alfaLink) applyLink(res.alfaLink);
    setMsg("Каналы фона с Alfa записаны. Ольга по-прежнему пишет на диск.");
  }

  async function tickQueue(force: boolean) {
    setBusy(true);
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "crmQueueTick", force } as never,
      })) as { ok?: boolean; extra?: string; queue?: typeof queue; error?: string; live?: number };
      if (res.queue) setQueue(res.queue);
      setMsg(res.error || res.extra || (res.ok ? `Пакет прошёл${res.live != null ? `, живых ${res.live}` : ""}` : "Очередь не ответила."));
      await loadCache();
    } finally {
      setBusy(false);
    }
  }

  async function loadJournal() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "journalPull" } as never,
      })) as typeof journal;
      if (res) setJournal(res);
    } catch {
      /* */
    }
  }

  async function runJournal(opts: {
    kind: "group" | "school" | "students" | "balance" | "life" | "details";
    study?: "1" | "2" | "all";
    school?: string;
    groupId?: number;
    branchId?: number;
    periodKey?: string;
    periodLabel?: string;
    grain?: Grain;
    recheck?: boolean;
  }) {
    setBusy(true);
    if (opts.kind === "group" || opts.kind === "details") {
      setFillLoading({ groupId: opts.groupId || 0, branchId: opts.branchId || 0, periodKey: opts.periodKey || "", label: opts.periodLabel || "", kind: opts.kind });
    }
    try {
      const res = (await adminSchedule({
        data: {
          token: token(),
          action: "journalPull",
          kind: opts.kind,
          school: opts.school || "",
          groupId: opts.groupId || 0,
          branchId: opts.branchId || 0,
          study: opts.study || "all",
          periodKey: opts.periodKey || "",
          grain: opts.grain || journalGrain,
          recheck: Boolean(opts.recheck),
        } as never,
      })) as typeof journal & { ok?: boolean; periodLabel?: string; periodKey?: string };
      if (res) setJournal(res);
      setMsg(res?.error || res?.extra || (res?.ok ? "Пакет записан на сайт." : "Журнал не ответил."));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Журнал не ответил.");
    } finally {
      setBusy(false);
      setFillLoading(null);
    }
  }

  async function recheckSchool() {
    const rows = (journal?.progress?.groups?.rows || []).filter((r) => !journalSchool || r.school === journalSchool);
    const queue = rows.filter((r) => !r.complete || (r.parts || []).some((p) => p.weak));
    if (!queue.length) {
      setMsg("В этом фильтре все группы сверены.");
      return;
    }
    stopSchool.current = false;
    setSchoolRun({ cur: queue[0]?.name || "", n: 0, total: queue.length });
    for (let i = 0; i < queue.length; i += 1) {
      if (stopSchool.current) break;
      const row = queue[i];
      const part = nextRecheckPart(row, journalGrain);
      setSchoolRun({ cur: `${row.name}${part ? ` · ${part.label}` : ""}`, n: i + 1, total: queue.length });
      if (!part) continue;
      await runJournal({
        kind: "group",
        groupId: Number(row.groupId) || 0,
        branchId: Number(row.branchId) || 0,
        periodKey: part.key,
        periodLabel: part.label,
        grain: journalGrain,
        recheck: true,
      });
    }
    setSchoolRun(null);
    if (stopSchool.current) setMsg("Очередь школы остановлена.");
  }

  async function recheckGroup(row: FillRow) {
    const chunks = packGrain(row.parts, clampGrain(row.age, journalGrain));
    if (!chunks.length) {
      setMsg("Нет кварталов у этой группы.");
      return;
    }
    stopSchool.current = false;
    setSchoolRun({ cur: row.name, n: 0, total: chunks.length });
    for (let i = 0; i < chunks.length; i += 1) {
      if (stopSchool.current) break;
      const part = chunks[i];
      setSchoolRun({ cur: `${row.name} · ${part.label}`, n: i + 1, total: chunks.length });
      await runJournal({
        kind: "group",
        groupId: Number(row.groupId) || 0,
        branchId: Number(row.branchId) || 0,
        periodKey: part.key,
        periodLabel: part.label,
        grain: journalGrain,
        recheck: true,
      });
    }
    setSchoolRun(null);
    if (stopSchool.current) setMsg("Очередь группы остановлена.");
  }

  async function loadStages() {
    setBusy(true);
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "leadsBoard", branchId: 2, force: false } as never,
      })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
      if (res.ok && Array.isArray(res.stages) && res.stages.length) {
        setStages(mergeStages(res.stages));
        setMsg("");
      } else if (res.error) setMsg(res.error);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось прочитать этапы.");
    } finally {
      setBusy(false);
    }
  }

  async function sortStages(ids: number[]) {
    const pinned = pinUnsorted(ids);
    const prev = stages;
    setStages((xs) => {
      const by = new Map(xs.map((s) => [s.id, s]));
      const next = pinned.map((id) => by.get(id)).filter((s): s is LeadStage => Boolean(s));
      for (const s of xs) if (!next.some((x) => x.id === s.id)) next.push(s);
      return next;
    });
    setMsg("Порядок на диске, Alfa в очереди.");
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageSort", stageIds: pinned, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    if (res.ok && Array.isArray(res.stages)) {
      setStages(mergeStages(res.stages));
      setMsg("Порядок записан. Alfa догонит очередью.");
      return;
    }
    setStages(prev);
    setMsg(res.error || "Не записали порядок этапов.");
  }

  function shift(id: number, dir: -1 | 1) {
    if (id === 0) return;
    const ids = stages.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length || ids[j] === 0) return;
    const next = ids.slice();
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    void sortStages(next);
  }

  async function saveName(id: number, name: string) {
    const title = name.trim();
    setEditId(null);
    if (!title || id === 0) return;
    const prev = stages.find((s) => s.id === id)?.name;
    if (title === prev) return;
    setStages((xs) => xs.map((s) => (s.id === id ? { ...s, name: title } : s)));
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageSave", stageId: id, name: title, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    if (res.ok && Array.isArray(res.stages)) setStages(mergeStages(res.stages));
    else setMsg(res.error || "Не удалось переименовать этап.");
  }

  async function saveColor(id: number, color: string) {
    if (id === 0) return;
    setStages((xs) => xs.map((s) => (s.id === id ? { ...s, color } : s)));
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageSave", stageId: id, color, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    if (res.ok && Array.isArray(res.stages)) setStages(mergeStages(res.stages));
    else setMsg(res.error || "Не удалось сменить цвет.");
  }

  async function addStage() {
    const title = addName.trim();
    if (!title) return;
    setBusy(true);
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageCreate", name: title, color: addColor, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    setBusy(false);
    if (res.ok && Array.isArray(res.stages)) {
      setStages(mergeStages(res.stages));
      setAddName("");
      setMsg(`Этап «${title}» добавлен.`);
      return;
    }
    setMsg(res.error || "Не удалось создать этап.");
  }

  async function removeStage(id: number, name: string) {
    if (id === 0) return;
    if (!window.confirm(`Удалить этап «${name}» в AlfaCRM? Лиды с него уйдут в «Не разобрано».`)) return;
    setBusy(true);
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageDelete", stageId: id, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    setBusy(false);
    if (res.ok && Array.isArray(res.stages)) {
      setStages(mergeStages(res.stages));
      setMsg(`Этап «${name}» удалён.`);
      return;
    }
    setMsg(res.error || "Не удалось удалить этап.");
  }

  function setMinutes(n: number) {
    const v = Math.max(2, Math.min(60, n));
    setSyncMin(v);
    try {
      localStorage.setItem(CRM_SYNC_MIN_KEY, String(v));
    } catch {
      /* */
    }
    void saveSync({ minutes: v });
  }

  const named = stages.filter((s) => s.id !== 0);
  const unsorted = stages.find((s) => s.id === 0) || LEAD_STAGES[0];

  return (
    <div className="space-y-4 pb-8 [overflow-anchor:none]">
      <div>
        <h2 className="font-display text-3xl">Настройка CRM</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Этапы, журнал и связь с Alfa — по вкладкам, не одной простынёй.
        </p>
      </div>
      <div ref={crmTabsRef} className="sticky top-0 z-20 -mx-1 flex flex-wrap gap-1 bg-[var(--color-bg)] px-1 py-2">
        {CRM_SET_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", crmTab === t.id ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
            onClick={() => pickCrmTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[70vh]">
      {crmTab === "people" ? (
      <Card
        title="Люди и роли"
        hint="Кто пишет на диск. Alfa догоняет очередью и не меняет автора. Пароль кабинета один — сотрудник. Два ИИ без пароля: ассистент в админке, консультант на сайте. Очередь — пакеты cgi и выгрузка."
      >
        <ul className="space-y-2">
          {(actors?.actors || CRM_ACTORS).map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <span className="mt-1 rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {a.kind === "human" ? "человек" : a.kind === "ai" ? "ИИ" : "система"}
              </span>
              <div className="min-w-[12rem] flex-1">
                {a.id === "human" ? (
                  <label className="block text-sm font-semibold">
                    Сотрудник
                    <input
                      value={humanName}
                      onChange={(e) => setHumanName(e.target.value)}
                      onBlur={() => void saveActorsName()}
                      className="mt-1 h-9 w-full rounded-full bg-white px-3 text-sm font-medium ring-1 ring-black/8"
                    />
                  </label>
                ) : (
                  <p className="text-sm font-semibold">{a.name}</p>
                )}
                <p className="mt-0.5 text-[0.75rem] text-muted">{a.hint}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.75rem] text-muted">Пароль входа тот же. Несколько сотрудников — следующим шагом, не смешивать с ИИ.</p>
      </Card>
      ) : null}

      {crmTab === "alfa" ? (
      <>
      <Card
        title="Фон с AlfaCRM"
        hint="Диск сайта — правда. Ольга и формы пишут сюда сразу. Ниже — что подгружать из Alfa, что выгружать обратно, и предохранители трубы (лимит, токен, повтор создания)."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {ALFA_LINK_MODES.map((m) => {
            const on = alfaMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={busy}
                onClick={() => void saveAlfaMode(m.id)}
                className={cn(
                  "rounded-2xl px-4 py-3 text-left ring-1 transition",
                  on ? "bg-black text-white ring-black" : "bg-surface-2 ring-black/8 hover:bg-white",
                )}
              >
                <p className="text-sm font-semibold">{m.title}</p>
                <p className={cn("mt-1 text-[0.75rem] leading-snug", on ? "text-white/80" : "text-muted")}>{m.hint}</p>
              </button>
            );
          })}
        </div>
        <div className={cn("mt-4 grid gap-4 md:grid-cols-2", alfaMode === "offline" && "opacity-50")}>
          <div>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">Подгружать из Alfa</p>
            <ul className="mt-2 space-y-1.5">
              {ALFA_PULL_CH.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={busy || alfaMode === "offline"}
                      checked={pull[c.id as AlfaPullCh]}
                      onChange={(e) => void saveSync({ pull: { ...pull, [c.id]: e.target.checked } })}
                    />
                    <span>
                      <span className="font-semibold">{c.title}</span>
                      <span className="mt-0.5 block text-[0.72rem] text-muted">{c.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">Выгружать в Alfa</p>
            <ul className="mt-2 space-y-1.5">
              {ALFA_PUSH_CH.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={busy || alfaMode === "offline"}
                      checked={push[c.id as AlfaPushCh]}
                      onChange={(e) => void saveSync({ push: { ...push, [c.id]: e.target.checked } })}
                    />
                    <span>
                      <span className="font-semibold">{c.title}</span>
                      <span className="mt-0.5 block text-[0.72rem] text-muted">{c.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className={cn("mt-4", alfaMode === "offline" && "opacity-50")}>
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">Труба в Alfa</p>
          <ul className="mt-2 grid gap-1.5 md:grid-cols-2">
            {ALFA_PIPE_CH.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={busy || alfaMode === "offline"}
                    checked={pipe[c.id as AlfaPipeCh]}
                    onChange={(e) => void saveSync({ pipe: { ...pipe, [c.id]: e.target.checked } })}
                  />
                  <span>
                    <span className="font-semibold">{c.title}</span>
                    <span className="mt-0.5 block text-[0.72rem] text-muted">{c.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Сверять каждые
          <select
            className="h-9 rounded-full bg-surface-2 px-3 text-sm font-medium ring-1 ring-black/8"
            value={syncMin}
            disabled={busy || alfaMode === "offline"}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {[2, 5, 10, 15, 30].map((n) => (
              <option key={n} value={n}>
                {n} мин
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Касса за
          <select
            className="h-9 rounded-full bg-surface-2 px-3 text-sm font-medium ring-1 ring-black/8"
            value={payDays}
            disabled={busy || alfaMode === "offline"}
            onChange={(e) => void saveSync({ payDays: Number(e.target.value) })}
          >
            {[1, 2, 3, 5, 7, 14].map((n) => (
              <option key={n} value={n}>
                {n} дн
              </option>
            ))}
          </select>
        </label>
        </div>
        <p className="mt-2 text-[0.75rem] text-muted">
          Выключенный канал: на сайте запись есть, в Alfa не уходит, пока не включите. Очередь хранит задание. Касса опрашивает окно дней, не всю историю.
        </p>
      </Card>

      <Card
        title="Люди в Alfa"
        hint="Сейчас работают и у нас, и в Alfa. Интервал и каналы — выше. F5 Alfa не ждёт."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold">
            Сверять CRM каждые
            <select
              className="ml-2 h-9 rounded-full bg-surface-2 px-3 text-sm ring-1 ring-black/8"
              value={syncMin}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[5, 10, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} мин
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadStages()}
            className="h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-black/10 hover:bg-black/5"
          >
            Обновить этапы
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-[0.82rem] text-muted">
          <li>Состав и абонементы — фоновые пакеты.</li>
          <li>Лиды — только карточки с новым updated_at.</li>
          <li>Журнал урока — фон по 2 группы, как состав. Очередь старше входа. «Обновить» у группы — сразу.</li>
          <li>Касса пока в Alfa: платёж у нас сразу на диск и в очередь.</li>
        </ul>
      </Card>
      </>
      ) : null}

      {crmTab === "history" ? (
      <Card
        title="Загрузить историю из Alfa"
        hint="Только по кнопке. ○ сверить · ~ оборвалось · ✓ сверено с Alfa. Зелёное — не «уже на сайте», а сверенный квартал."
      >
        {(() => {
          const offline = alfaMode === "offline";
          const p = journal?.progress;
          const schoolRows = (p?.groups?.rows || []).filter((r) => !journalSchool || r.school === journalSchool);
          const schoolDone = schoolRows.filter((r) => fillFinishedRow(r, journalGrain)).length;
          const schoolNeed = Math.max(0, schoolRows.length - schoolDone);
          const schoolNeedLife = schoolRows.filter((r) => r.source !== "alfa").length;
          return (
            <div className={cn("space-y-3", offline && "opacity-50")}>
              {journal?.note ? <p className="rounded-xl bg-black/5 px-3 py-2 text-sm">{journal.note}</p> : null}
              <div ref={histTabsRef} className="flex flex-wrap gap-1">
                {HIST_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold", histTab === t.id ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
                    onClick={() => pickHistTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {histTab === "groups" ? (
              <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
                <p className="font-display text-[1.15rem]">Занятия в группах</p>
                <p className="mt-1 text-sm text-muted">Сначала сроки по расписанию: молодая группа — пара кварталов, старая — несколько лет. Потом грузите только эти порции.</p>
                <ProgressBar done={schoolDone} total={schoolRows.length} run={Boolean(schoolRun || fillLoading)} />
                <p className="mt-1 text-[0.72rem] text-muted">
                  {journalSchool ? `Школа «${journalSchool}»: загрузка завершена ${schoolDone} из ${schoolRows.length}` : "Все школы. Выберите школу — счётчик только по ней"}
                  {schoolNeed ? ` · требуют загрузки ${schoolNeed}` : ""}.
                </p>
                <div className="mt-3 flex flex-wrap items-start gap-3">
                  <button
                    type="button"
                    className={cn(BTN_LOAD, (busy && !schoolRun) && "ra-progress-run")}
                    disabled={busy || offline}
                    onClick={() => void runJournal({ kind: "life", school: journalSchool })}
                  >
                    {busy && !schoolRun ? "Смотрю сроки…" : schoolNeedLife ? `Уточнить ещё ${schoolNeedLife}` : "Определить сроки групп"}
                  </button>
                  {journal?.lastLife ? (
                    <div className="min-w-[16rem] flex-1 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-black/10">
                      <p className="font-semibold">
                        Определено {journal.lastLife.total} {journal.lastLife.total === 1 ? "группа" : journal.lastLife.total < 5 ? "группы" : "групп"}
                        {journal.lastLife.school ? ` в «${journal.lastLife.school}»` : ""}
                      </p>
                      <ul className="mt-2 space-y-1 text-[0.92rem]">
                        <li>
                          <span className="font-semibold text-sky-900">молодых {journal.lastLife.young}</span>
                          {journal.lastLife.youngNames?.length ? <span className="text-muted"> — {journal.lastLife.youngNames.join(", ")}</span> : null}
                        </li>
                        <li>
                          <span className="font-semibold text-amber-900">средних {journal.lastLife.mid}</span>
                          {journal.lastLife.midNames?.length ? <span className="text-muted"> — {journal.lastLife.midNames.join(", ")}</span> : null}
                        </li>
                        <li>
                          <span className="font-semibold text-zinc-800">старых {journal.lastLife.old}</span>
                          {journal.lastLife.oldNames?.length ? <span className="text-muted"> — {journal.lastLife.oldNames.join(", ")}</span> : null}
                        </li>
                        {journal.lastLife.unknown ? (
                          <li>
                            <span className="font-semibold text-rose-800">без срока {journal.lastLife.unknown}</span>
                            {journal.lastLife.unknownNames?.length ? <span className="text-muted"> — {journal.lastLife.unknownNames.join(", ")}</span> : null}
                          </li>
                        ) : null}
                      </ul>
                      <p className="mt-2 text-[0.72rem] text-muted">
                        {journal.lastLife.probed
                          ? `Срок из Alfa уточнили у ${journal.lastLife.probed}${journal.lastLife.left ? `, осталось ${journal.lastLife.left} — нажмите ещё` : ""}.`
                          : "Дальше грузите только видимые кварталы у каждой группы."}
                      </p>
                    </div>
                  ) : (
                    <p className="pt-2 text-sm text-muted">После нажатия здесь появится отчёт: сколько молодых, средних и старых.</p>
                  )}
                </div>
                <label className="mt-3 block text-sm font-semibold">
                  Только школа
                  <select
                    className="mt-1 h-9 w-full rounded-full bg-white px-3 text-sm font-medium ring-1 ring-black/8"
                    value={journalSchool}
                    disabled={busy || offline}
                    onChange={(e) => pickJournalSchool(e.target.value)}
                  >
                    <option value="">Все школы</option>
                    {(journal?.schools || []).map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-3 text-sm font-semibold">Порция за одно нажатие</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(
                    [
                      ["quarter", "Квартал"],
                      ["half", "Полугодие"],
                      ["year", "Год (молодые)"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={cn("h-9 rounded-full px-3 text-sm font-semibold", journalGrain === id ? "bg-black text-white" : "bg-white ring-1 ring-black/10")}
                      onClick={() => pickJournalGrain(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[0.72rem] text-muted">Год — только у молодых. У старых и средних максимум полугодие, даже если выбран год.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={cn(BTN_LOAD, schoolRun && "ra-progress-run")}
                    disabled={offline || Boolean(schoolRun)}
                    onClick={() => void recheckSchool()}
                  >
                    {schoolRun ? `Школа ${schoolRun.n}/${schoolRun.total}` : journalSchool ? "Перепроверить школу" : "Перепроверить все группы"}
                  </button>
                  {schoolRun ? (
                    <button
                      type="button"
                      className={BTN_GHOST}
                      onClick={() => {
                        stopSchool.current = true;
                      }}
                    >
                      Стоп
                    </button>
                  ) : null}
                </div>
                {schoolRun ? <p className="mt-1 text-sm text-muted">Сейчас {schoolRun.cur}</p> : null}
                <GroupFillList
                  rows={p?.groups?.rows || []}
                  school={journalSchool}
                  busy={busy || offline || Boolean(schoolRun)}
                  loading={fillLoading || undefined}
                  grain={journalGrain}
                  onLoad={(row, part, recheck) =>
                    void runJournal({
                      kind: "group",
                      groupId: Number(row.groupId) || 0,
                      branchId: Number(row.branchId) || 0,
                      periodKey: part.key,
                      periodLabel: part.label,
                      grain: journalGrain,
                      recheck,
                    })
                  }
                  onRecheck={(row, part) =>
                    void runJournal({
                      kind: "group",
                      groupId: Number(row.groupId) || 0,
                      branchId: Number(row.branchId) || 0,
                      periodKey: part.key,
                      periodLabel: part.label,
                      grain: journalGrain,
                      recheck: true,
                    })
                  }
                  onRecheckAll={(row) => void recheckGroup(row)}
                  onStop={() => {
                    stopSchool.current = true;
                  }}
                  onDetails={(row, part) =>
                    void runJournal({
                      kind: "details",
                      groupId: Number(row.groupId) || 0,
                      branchId: Number(row.branchId) || 0,
                      periodKey: part?.key || "",
                      periodLabel: part?.label || "тема, ДЗ, комментарий",
                    })
                  }
                />
                <p className="mt-2 text-[0.72rem] text-muted">
                  Название группы раскрывает карточку на месте, без прыжка вверх. Другая группа — эта закрывается. Список без внутреннего скролла.
                </p>
              </section>
              ) : null}

              {histTab === "students" ? (
              <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
                <p className="font-display text-[1.15rem]">Календарь ученика</p>
                <p className="mt-1 text-sm text-muted">Цветные клетки на карточке. Готово — только полный личный журнал или все группы ученика сверены. Одна старая явка больше не закрывает карточку.</p>
                <p className="mt-2 text-sm font-semibold">Сейчас ходят</p>
                <ProgressBar done={p?.live?.journalDone || 0} total={p?.live?.total || 0} run={fillLoading?.kind === "students"} />
                <p className="mt-3 text-sm font-semibold">Уже не ходят (архив)</p>
                <ProgressBar done={p?.archive?.journalDone || 0} total={p?.archive?.total || 0} run={fillLoading?.kind === "students"} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={cn(BTN_LOAD, fillLoading?.kind === "students" && "ra-progress-run")} disabled={busy || offline} onClick={() => void runJournal({ kind: "students", study: "1" })}>
                    Загрузить 10 текущих
                  </button>
                  <button type="button" className={cn(BTN_LOAD, fillLoading?.kind === "students" && "ra-progress-run")} disabled={busy || offline} onClick={() => void runJournal({ kind: "students", study: "2" })}>
                    Загрузить 10 архивных
                  </button>
                  <button type="button" className={BTN_GHOST} onClick={() => setOpenMiss(openMiss === "j1" ? "" : "j1")}>
                    {openMiss === "j1" ? "Скрыть" : "Кому из текущих нет"}
                  </button>
                  <button type="button" className={BTN_GHOST} onClick={() => setOpenMiss(openMiss === "j2" ? "" : "j2")}>
                    {openMiss === "j2" ? "Скрыть" : "Кому из архива нет"}
                  </button>
                </div>
                {openMiss === "j1" ? <MissList pack={p?.live?.missJournal} empty="У всех текущих календарь уже есть." /> : null}
                {openMiss === "j2" ? <MissList pack={p?.archive?.missJournal} empty="У архивных календарь уже есть." /> : null}
              </section>
              ) : null}

              {histTab === "money" ? (
              <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
                <p className="font-display text-[1.15rem]">Деньги на карточке</p>
                <p className="mt-1 text-sm text-muted">Платежи и списания. Без этого остаток не совпадёт с Alfa.</p>
                <p className="mt-2 text-sm font-semibold">Сейчас ходят</p>
                <ProgressBar done={p?.live?.cardDone || 0} total={p?.live?.total || 0} run={fillLoading?.kind === "balance"} />
                <p className="mt-3 text-sm font-semibold">Уже не ходят (архив)</p>
                <ProgressBar done={p?.archive?.cardDone || 0} total={p?.archive?.total || 0} run={fillLoading?.kind === "balance"} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={cn(BTN_LOAD, fillLoading?.kind === "balance" && "ra-progress-run")} disabled={busy || offline} onClick={() => void runJournal({ kind: "balance", study: "1" })}>
                    10 текущих с деньгами
                  </button>
                  <button type="button" className={cn(BTN_LOAD, fillLoading?.kind === "balance" && "ra-progress-run")} disabled={busy || offline} onClick={() => void runJournal({ kind: "balance", study: "2" })}>
                    10 архивных с деньгами
                  </button>
                  <button type="button" className={BTN_GHOST} onClick={() => setOpenMiss(openMiss === "c1" ? "" : "c1")}>
                    {openMiss === "c1" ? "Скрыть" : "У кого из текущих нет"}
                  </button>
                  <button type="button" className={BTN_GHOST} onClick={() => setOpenMiss(openMiss === "c2" ? "" : "c2")}>
                    {openMiss === "c2" ? "Скрыть" : "У кого из архива нет"}
                  </button>
                </div>
                {openMiss === "c1" ? <MissList pack={p?.live?.missCard} empty="У текущих деньги уже есть." /> : null}
                {openMiss === "c2" ? <MissList pack={p?.archive?.missCard} empty="У архивных деньги уже есть." /> : null}
              </section>
              ) : null}
            </div>
          );
        })()}
      </Card>
      ) : null}

      {crmTab === "queue" ? (
      <Card
        title="Очередь в Alfa"
        hint={
          alfaMode === "offline"
            ? "Связь выключена — правки копятся на сайте и уйдут, когда включите Alfa."
            : "Уже сохранено у нас. Сейчас уйдёт в Alfa — рассылки сработают."
        }
      >
        {queue?.jobs?.length ? (
          <ul className="space-y-1.5">
            {queue.jobs.slice(0, 12).map((j, i) => (
              <li key={`${j.op}-${j.entityId}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                  {actorLabel(actorOf(j.actor), humanName)}
                </span>
                <span className="font-semibold">{exportOpLabel(j.op as CrmExportOp)}</span>
                {j.tries ? <span className="text-[0.72rem] text-rose-700">повтор {j.tries + 1}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Всё отправлено — Alfa ничего не ждёт.</p>
        )}
        <p className="mt-3 text-[0.75rem] text-muted">
          {queue?.exportPending ? `Ждут отправки: ${queue.exportPending}.` : "Очередь пуста."}
          {queue?.exportBusy ? " Отправляю…" : ""}
          {queue?.exportNote ? ` · ${queue.exportNote}` : ""}
          {queue?.pending ? ` · подтягиваю состав групп` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="h-9 rounded-full bg-black/8 px-4 text-sm" disabled={busy} onClick={() => void tickQueue(false)}>
            {alfaMode === "offline" ? "Сейчас без связи" : "Отправить в Alfa"}
          </button>
        </div>
      </Card>
      ) : null}

      {crmTab === "funnel" ? (
      <>
      <Card
        title="Воронка продаж"
        hint="Как в AlfaCRM: Настройки → Воронки продаж. «Не разобрано» системный, его нельзя сдвинуть. Остальные — перетащите или кнопками вверх/вниз."
      >
        <div className="overflow-hidden rounded-xl ring-1 ring-black/8">
          <table className="w-full text-left">
            <thead className="bg-black/[0.03] text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-2 py-2">Этап</th>
                <th className="px-2 py-2">Цвет</th>
                <th className="px-2 py-2 text-right">ID</th>
                <th className="px-2 py-2 text-right">Порядок</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-black/6 bg-black/[0.02]">
                <td className="px-3 py-2 text-center text-muted">—</td>
                <td className="px-2 py-2 text-[0.88rem] font-semibold" style={{ color: unsorted.color }}>
                  {unsorted.name}
                  <span className="ml-2 text-[0.72rem] font-normal text-muted">системный</span>
                </td>
                <td className="px-2 py-2">
                  <span className="inline-block h-4 w-4 rounded-full ring-1 ring-black/15" style={{ background: unsorted.color }} />
                </td>
                <td className="px-2 py-2 text-right text-[0.8rem] text-muted">0</td>
                <td className="px-2 py-2 text-right text-[0.75rem] text-muted">фиксирован</td>
              </tr>
              {named.map((col) => (
                <tr
                  key={col.id}
                  draggable
                  onDragStart={(e) => {
                    dragId.current = col.id;
                    e.dataTransfer.setData("text/plain", String(col.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain") || dragId.current);
                    if (!from || from === col.id) return;
                    const ids = stages.map((s) => s.id).filter((id) => id !== from);
                    const at = ids.indexOf(col.id);
                    if (at < 0) return;
                    ids.splice(at, 0, from);
                    void sortStages(ids);
                  }}
                  className="cursor-grab border-t border-black/6 hover:bg-black/[0.03] active:cursor-grabbing"
                >
                  <td className="px-3 py-2 text-center text-muted">⇅</td>
                  <td className="px-2 py-2">
                    {editId === col.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => void saveName(col.id, editName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="h-8 w-full max-w-[16rem] rounded-lg bg-white px-2 text-[0.88rem] font-semibold ring-1 ring-black/10"
                      />
                    ) : (
                      <button
                        type="button"
                        className="text-left text-[0.88rem] font-semibold hover:underline"
                        style={{ color: col.color }}
                        onClick={() => {
                          setEditId(col.id);
                          setEditName(col.name);
                        }}
                      >
                        {col.name}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className="inline-flex gap-1">
                      {CRM_STAGE_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          title={c.hex}
                          onClick={() => void saveColor(col.id, c.hex)}
                          className={cn(
                            "h-4 w-4 rounded-full ring-1 ring-black/15",
                            col.color.toLowerCase() === c.hex.toLowerCase() && "ring-2 ring-fg",
                          )}
                          style={{ background: c.hex }}
                        />
                      ))}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-[0.8rem] text-muted">{col.id}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      className="mr-1 rounded-md px-2 py-0.5 text-[0.75rem] font-semibold ring-1 ring-black/10 hover:bg-black/5"
                      onClick={() => shift(col.id, -1)}
                    >
                      вверх
                    </button>
                    <button
                      type="button"
                      className="mr-1 rounded-md px-2 py-0.5 text-[0.75rem] font-semibold ring-1 ring-black/10 hover:bg-black/5"
                      onClick={() => shift(col.id, 1)}
                    >
                      вниз
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2 py-0.5 text-[0.75rem] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
                      onClick={() => void removeStage(col.id, col.name)}
                    >
                      удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block min-w-[12rem] flex-1">
            <span className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">Новый этап</span>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addStage();
              }}
              placeholder="Например: Запись на пробное"
              className="mt-1 h-10 w-full rounded-full bg-surface-2 px-3 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/35"
            />
          </label>
          <span className="inline-flex items-center gap-1 pb-2">
            {CRM_STAGE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setAddColor(c.hex)}
                className={cn("h-5 w-5 rounded-full ring-1 ring-black/15", addColor === c.hex && "ring-2 ring-fg")}
                style={{ background: c.hex }}
              />
            ))}
          </span>
          <button
            type="button"
            disabled={busy || !addName.trim()}
            onClick={() => void addStage()}
            className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40"
          >
            Добавить в CRM
          </button>
        </div>
        {msg ? <p className={cn("mt-3 text-sm font-semibold", msg.includes("не") || msg.includes("Не") ? "text-rose-700" : "text-emerald-800")}>{msg}</p> : null}
      </Card>

      <Card
        title="Автоматизация воронки продаж"
        hint="Сайт и карточка сами двигают этап в AlfaCRM. Ученика (is_study=1) и архив не трогает. С «Оплатил» назад в группу не возвращает."
      >
        <ul className="space-y-3">
          {(
            [
              ["siteOn", "siteStageId", "Заявка с сайта", "Форма пробного и ассистент"],
              ["groupOn", "groupStageId", "Добавили в группу", "Карточка клиента → группа"],
              ["tariffOn", "tariffStageId", "Абонемент или оплата", "Выдали абонемент или провели платёж"],
            ] as const
          ).map(([onKey, stageKey, title, hint]) => (
            <li key={onKey} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={auto[onKey]}
                onClick={() => void saveAuto({ ...auto, [onKey]: !auto[onKey] })}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition",
                  auto[onKey] ? "bg-primary" : "bg-black/15",
                )}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow", auto[onKey] ? "left-5" : "left-0.5")} />
              </button>
              <div className="min-w-[10rem] flex-1">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-[0.75rem] text-muted">{hint}</p>
              </div>
              <select
                className="h-9 rounded-full bg-white px-3 text-sm ring-1 ring-black/8"
                disabled={!auto[onKey]}
                value={auto[stageKey]}
                onChange={(e) => void saveAuto({ ...auto, [stageKey]: Number(e.target.value) })}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={auto.skipIfPaid}
            onChange={(e) => void saveAuto({ ...auto, skipIfPaid: e.target.checked })}
          />
          Не возвращать с «Оплатил», если снова добавили в группу
        </label>
      </Card>
      </>
      ) : null}

      {crmTab === "cache" ? (
      <Card
        title="Кэш сайта"
        hint="Что читать из хранилища админки, а что каждый раз из AlfaCRM. Оперативные данные — на лету. Абонементы учеников: счётчик сразу с диска сайта, без пакетов. Сверка CRM — фоном по филиалам."
      >
        <ul className="space-y-2">
          {CACHE_KIND_META.map((k) => {
            const rule = cache?.rules[k.id as CacheKind] || { cache: true, ttlMin: 10 };
            return (
              <li key={k.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.cache}
                  title={rule.cache ? "Читать из кэша сайта" : "Всегда из CRM"}
                  onClick={() =>
                    cache &&
                    void saveCache({
                      ...cache,
                      rules: { ...cache.rules, [k.id]: { ...rule, cache: !rule.cache } },
                    })
                  }
                  className={cn("relative h-6 w-11 shrink-0 rounded-full transition", rule.cache ? "bg-primary" : "bg-black/15")}
                >
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow", rule.cache ? "left-5" : "left-0.5")} />
                </button>
                <div className="min-w-[12rem] flex-1">
                  <p className="text-sm font-semibold">{k.title}</p>
                  <p className="text-[0.75rem] text-muted">{k.hint}</p>
                  <p className="text-[0.72rem] text-muted">{rule.cache ? `кэш ${rule.ttlMin} мин · ${k.liveHint}` : `на лету · ${k.liveHint}`}</p>
                </div>
                <label className="text-[0.75rem] text-muted">
                  TTL
                  <select
                    className="ml-2 h-9 rounded-full bg-white px-3 text-sm text-fg ring-1 ring-black/8"
                    disabled={!rule.cache}
                    value={rule.ttlMin}
                    onChange={(e) =>
                      cache &&
                      void saveCache({
                        ...cache,
                        rules: { ...cache.rules, [k.id]: { ...rule, ttlMin: Number(e.target.value) } },
                      })
                    }
                  >
                    {[5, 10, 15, 30, 60, 120].map((n) => (
                      <option key={n} value={n}>
                        {n} мин
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
        {cache?.overlayAt ? (
          <p className="mt-3 text-[0.75rem] text-muted">
            Последняя сверка абонементов: {new Date(cache.overlayAt).toLocaleString("ru-RU")}
            {cache.overlayTotal ? ` · ${cache.overlayNext}/${cache.overlayTotal} групп` : ""}
            {queue?.exportPending ? ` · выгрузка в Alfa ${queue.exportPending}` : ""}
            {queue?.pending && !queue.exportPending ? ` · в очереди ${queue.pending}` : ""}
            {queue?.lastNote ? ` · ${queue.lastNote}` : ""}
          </p>
        ) : (
          <p className="mt-3 text-[0.75rem] text-muted">
            Сверки абонементов ещё не было — пакеты идут сами, вкладка Клиенты их не обязана держать открытой.
            {queue?.exportPending ? ` Выгрузка в Alfa: ${queue.exportPending}.` : ""}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-9 rounded-full bg-black/8 px-4 text-sm"
            disabled={busy}
            onClick={() => void tickQueue(false)}
          >
            Пакет сейчас
          </button>
          <button
            type="button"
            className="h-9 rounded-full bg-black/8 px-4 text-sm"
            disabled={busy}
            onClick={() => void tickQueue(true)}
          >
            Круг с начала
          </button>
        </div>
      </Card>
      ) : null}

      {crmTab === "branches" ? (
      <Card title="Филиалы" hint="Лиды и клиенты в AlfaCRM привязаны к филиалу. На сайте тот же список.">
        <ul className="divide-y divide-black/6">
          {([1, 2, 3, 4] as const).map((id) => (
            <li key={id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-semibold">{CRM_BRANCH[id]?.short}</span>
                <span className="ml-2 text-muted">{CRM_BRANCH[id]?.name}</span>
              </span>
              <span className="tabular-nums text-muted">ID {id}</span>
            </li>
          ))}
        </ul>
      </Card>
      ) : null}

      {crmTab === "funnel" ? (
      <Card title="Какие карточки попадают в воронку">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Новая заявка</dt>
            <dd className="mt-1 text-muted">is_study = 0, обычно сразу этап «Разбирается». Появляется и в API, и на доске CRM.</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Клиент → «Сделать лидом»</dt>
            <dd className="mt-1 text-muted">Пишем is_study=0 и помечаем «на воронке». Список клиентов сразу убирает карточку, воронка — берёт. Если Alfa оставила is_study=1, сайт всё равно считает лидом.</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Архив</dt>
            <dd className="mt-1 text-muted">is_study = 2 или removed. С воронки снимается, кнопка «Загрузить „Архив“» на вкладке Клиенты.</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Ключ API</dt>
            <dd className="mt-1 text-muted">Хост, почта и ключ v2api — в разделе ключей интеграций (AlfaCRM). Без них воронка не читается.</dd>
          </div>
        </dl>
      </Card>
      ) : null}
      </div>
    </div>
  );
}