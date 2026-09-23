"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  HISTORY_PLAN_MODES,
  PLAN_FROM_OPTS,
  PLAN_RECHECK_OPTS,
  mskWall,
  nextSlotAt,
  pad2,
  planFromIdToRecheckDays,
  planModeMeta,
  planLogSessions,
  whenLabel,
  type CrmSyncPolicy,
  type HistoryPlanMode,
  type HistorySchedule,
  type HistoryWhen,
  type PlanFromId,
  type PlanUnit,
} from "@/data/crm-sync-policy-core";

type JobSnap = {
  running?: boolean;
  stop?: boolean;
  mode?: string;
  kind?: string;
  cur?: string;
  n?: number;
  total?: number;
  msg?: string;
};

type PlanLogRow = {
  at?: string;
  kind?: string;
  text?: string;
  who?: string;
  cid?: number;
  mode?: string;
  reason?: string;
  src?: string;
};

const LOG_KIND: Record<string, string> = {
  start: "Старт",
  skip: "Пропуск",
  fail: "Сбой",
  stop: "Стоп",
  done: "Готово",
  pipe: "Шаг",
  toggle: "Пульт",
};

function logWhen(at?: string) {
  if (!at) return "";
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return "";
  const w = mskWall(d);
  return `${pad2(w.d)}.${pad2(w.mo)} ${pad2(w.h)}:${pad2(w.min)}`;
}

const DAYS = [
  { n: 1, t: "Пн" },
  { n: 2, t: "Вт" },
  { n: 3, t: "Ср" },
  { n: 4, t: "Чт" },
  { n: 5, t: "Пт" },
  { n: 6, t: "Сб" },
  { n: 7, t: "Вс" },
];

function Chip({ on, children, onClick, disabled }: { on?: boolean; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-[0.78rem] font-semibold ring-1",
        on ? "bg-black text-white ring-black" : "bg-white ring-black/10 hover:bg-black/5",
        disabled && "opacity-50",
      )}
    >
      {children}
    </button>
  );
}

function fmtSlot(rule: HistorySchedule) {
  if (rule.dueAt) return "в очереди";
  const d = nextSlotAt(rule);
  if (!d) return "слота нет";
  const w = mskWall(d);
  return `${pad2(w.d)}.${pad2(w.mo)} ${pad2(w.h)}:${pad2(w.min)} МСК`;
}

function isRecheck(mode: string) {
  return Boolean(planModeMeta(mode).recheck);
}

function draftBits(seed?: HistorySchedule | null) {
  const when = seed?.when;
  return {
    label: seed?.label || "",
    mode: (seed?.mode || "auto") as HistoryPlanMode,
    kind: (when?.kind || "daily") as HistoryWhen["kind"],
    days: when?.kind === "weekly" && when.days.length ? when.days : [1],
    every: when?.kind === "interval" ? when.every : 6,
    unit: (when?.kind === "interval" ? when.unit : "month") as PlanUnit,
    nth: when?.kind === "nthWeekday" ? when.n : 1,
    nthDay: when?.kind === "nthWeekday" ? when.day : 1,
    date: when?.kind === "ymd" ? when.date : "",
    at: seed?.at || "04:00",
    recheckDays: seed?.recheckDays || 7,
    fromId: (seed?.dateFromId || "2015") as PlanFromId,
    study: (seed?.study || "1") as "1" | "2",
    leads: seed ? seed.leads !== false : true,
    archGroups: seed ? seed.archGroups !== false : true,
  };
}

function DraftForm({
  busy,
  seed,
  onCancel,
  onSave,
}: {
  busy?: boolean;
  seed?: HistorySchedule | null;
  onCancel: () => void;
  onSave: (row: Omit<HistorySchedule, "id" | "dueAt" | "lastFiredAt" | "lastJobId" | "lastSkip">) => void;
}) {
  const init = draftBits(seed);
  const [label, setLabel] = useState(init.label);
  const [mode, setMode] = useState<HistoryPlanMode>(init.mode);
  const [kind, setKind] = useState<HistoryWhen["kind"]>(init.kind);
  const [days, setDays] = useState<number[]>(init.days);
  const [every, setEvery] = useState(init.every);
  const [unit, setUnit] = useState<PlanUnit>(init.unit);
  const [nth, setNth] = useState(init.nth);
  const [nthDay, setNthDay] = useState(init.nthDay);
  const [date, setDate] = useState(init.date);
  const [at, setAt] = useState(init.at);
  const [recheckDays, setRecheckDays] = useState(init.recheckDays);
  const [fromId, setFromId] = useState<PlanFromId>(init.fromId);
  const [study, setStudy] = useState<"1" | "2">(init.study);
  const [leads, setLeads] = useState(init.leads);
  const [archGroups, setArchGroups] = useState(init.archGroups);

  function when(): HistoryWhen {
    if (kind === "weekly") return { kind: "weekly", days };
    if (kind === "interval") return { kind: "interval", every, unit };
    if (kind === "nthWeekday") return { kind: "nthWeekday", n: nth, day: nthDay };
    if (kind === "ymd") return { kind: "ymd", date };
    return { kind: "daily" };
  }

  const canSave =
    Boolean(at) &&
    (kind !== "weekly" || days.length > 0) &&
    (kind !== "ymd" || Boolean(date));

  const [step, setStep] = useState(0);
  const titles = ["Что запускать", "Когда", "Кого", "Сохранить"];

  return (
    <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
      <p className="text-[0.72rem] font-semibold text-muted">
        {step + 1} из {titles.length} · {seed ? "правка" : "новое"}
      </p>
      <p className="font-display text-[1.05rem]">{titles[step]}</p>
      {step === 0 ? (
        <label className="mt-3 block text-sm font-semibold">
          Режим
          <select
            className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
            value={mode}
            onChange={(e) => setMode(e.target.value as HistoryPlanMode)}
          >
            {HISTORY_PLAN_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {step === 1 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip on={kind === "daily"} onClick={() => setKind("daily")}>Каждый день</Chip>
            <Chip on={kind === "weekly"} onClick={() => setKind("weekly")}>Дни недели</Chip>
            <Chip on={kind === "interval"} onClick={() => setKind("interval")}>Каждые N</Chip>
            <Chip on={kind === "nthWeekday"} onClick={() => setKind("nthWeekday")}>День месяца</Chip>
            <Chip on={kind === "ymd"} onClick={() => setKind("ymd")}>Одна дата</Chip>
          </div>
          {kind === "weekly" ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <Chip
                  key={d.n}
                  on={days.includes(d.n)}
                  onClick={() => setDays(days.includes(d.n) ? days.filter((x) => x !== d.n) : [...days, d.n].sort((a, b) => a - b))}
                >
                  {d.t}
                </Chip>
              ))}
            </div>
          ) : null}
          {kind === "interval" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm">каждые</span>
              <input
                type="number"
                min={1}
                max={36}
                className="h-9 w-16 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
                value={every}
                onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))}
              />
              <select
                className="h-9 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
                value={unit}
                onChange={(e) => setUnit(e.target.value as PlanUnit)}
              >
                <option value="day">дней</option>
                <option value="week">недель</option>
                <option value="month">месяцев</option>
              </select>
            </div>
          ) : null}
          {kind === "nthWeekday" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className="h-9 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8" value={nth} onChange={(e) => setNth(Number(e.target.value))}>
                <option value={1}>1-й</option>
                <option value={2}>2-й</option>
                <option value={3}>3-й</option>
                <option value={4}>4-й</option>
                <option value={5}>5-й</option>
                <option value={-1}>последний</option>
              </select>
              <select className="h-9 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8" value={nthDay} onChange={(e) => setNthDay(Number(e.target.value))}>
                {DAYS.map((d) => (
                  <option key={d.n} value={d.n}>{d.t}</option>
                ))}
              </select>
            </div>
          ) : null}
          {kind === "ymd" ? (
            <input type="date" className="mt-2 h-9 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8" value={date} onChange={(e) => setDate(e.target.value)} />
          ) : null}
          <label className="mt-3 block text-sm font-semibold">
            Время · МСК
            <input type="time" step={900} className="mt-1 h-10 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8" value={at} onChange={(e) => setAt(e.target.value)} />
          </label>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip on={study === "1"} onClick={() => setStudy("1")}>Сейчас ходят</Chip>
            <Chip on={study === "2"} onClick={() => setStudy("2")}>Архив</Chip>
          </div>
          {mode === "auto" || isRecheck(mode) || mode === "people" || mode === "people-slow" || mode === "balance" ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(mode === "auto" || mode === "people" || mode === "people-slow" || mode === "balance" ? PLAN_FROM_OPTS : PLAN_RECHECK_OPTS).map((o) =>
                "id" in o ? (
                  <Chip key={o.id} on={fromId === o.id} onClick={() => setFromId(o.id)}>{o.label}</Chip>
                ) : (
                  <Chip key={o.days} on={recheckDays === o.days} onClick={() => setRecheckDays(o.days)}>{o.label}</Chip>
                ),
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Окно лет этому шагу не нужно.</p>
          )}
          {study === "1" && mode === "auto" ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip on={leads} onClick={() => setLeads((v) => !v)}>Лиды действующих групп</Chip>
              <Chip on={archGroups} onClick={() => setArchGroups((v) => !v)}>Архив действующих групп</Chip>
            </div>
          ) : null}
        </>
      ) : null}
      {step === 3 ? (
        <>
          <label className="mt-3 block text-sm font-semibold">
            Подпись
            <input
              className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-medium ring-1 ring-black/8"
              value={label}
              placeholder="например, Ночь · сверка"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <p className="mt-3 text-sm">
            {planModeMeta(mode).label}. {whenLabel(when())}, {at} МСК. {study === "2" ? "Архив." : "Сейчас ходят."}
          </p>
          <p className="mt-1 text-[0.75rem] text-muted">Пока общий тумблер выкл — слот лежит и ночью не стартует.</p>
        </>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button type="button" className="h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-black/10" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
          {step === 0 ? "Отмена" : "Назад"}
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="h-9 rounded-full bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
            disabled={step === 1 && !canSave}
            onClick={() => setStep(step + 1)}
          >
            Дальше
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !canSave}
            className="h-9 rounded-full bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => {
              onSave({
                on: true,
                mode,
                when: when(),
                at,
                recheckDays: mode === "auto" ? planFromIdToRecheckDays(fromId) : recheckDays,
                dateFromId: fromId,
                study,
                label,
                leads: study === "1" && leads,
                archGroups: study === "1" && archGroups,
              });
            }}
          >
            {seed ? "Сохранить" : "Сохранить расписание"}
          </button>
        )}
      </div>
    </div>
  );
}

function NowWizard({
  busy,
  run,
  onRunAuto,
  onRunOne,
}: {
  busy?: boolean;
  run?: boolean;
  onRunAuto?: (opts: { study: "1" | "2"; dateFromId: PlanFromId; leads?: boolean; archGroups?: boolean }) => void;
  onRunOne?: (opts: { cid: number; kind: "audit" | "calendar"; dateFromId: PlanFromId }) => void;
}) {
  const [step, setStep] = useState(0);
  const [whoKind, setWhoKind] = useState<"one" | "live" | "arch">("one");
  const [act, setAct] = useState<"audit" | "calendar" | "all">("audit");
  const [who, setWho] = useState("");
  const [from, setFrom] = useState<PlanFromId>("1");
  const [leads, setLeads] = useState(true);
  const [archGroups, setArchGroups] = useState(true);
  const cid = Number(String(who).match(/\d+/)?.[0] || 0);
  const titles = ["Кого", "Что сделать", "Окно", "Запуск"];
  const one = whoKind === "one";
  const canNext =
    (step !== 0 || true) &&
    (step !== 1 || (one ? act === "audit" || act === "calendar" : true)) &&
    (step !== 2 || true);

  function go() {
    if (one) {
      if (!onRunOne || !cid) return;
      const kind = act === "calendar" ? "calendar" : "audit";
      const ask = kind === "audit" ? `Шаг 5 только №${cid}? Календарь и кассу не трогаем.` : `Календарь №${cid}? Кассу не трогаем.`;
      if (!window.confirm(ask)) return;
      onRunOne({ cid, kind, dateFromId: from });
      return;
    }
    if (!onRunAuto) return;
    if (!window.confirm("Перепроверить шаги 1–5 сейчас? Сначала дырки слева, потом все справа. Та же очередь.")) return;
    onRunAuto({
      study: whoKind === "arch" ? "2" : "1",
      dateFromId: from,
      leads: whoKind === "live" && leads,
      archGroups: whoKind === "live" && archGroups,
    });
  }

  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <p className="text-[0.72rem] font-semibold text-muted">{step + 1} из 4 · {titles[step]}</p>
      {step === 0 ? (
        <div className="mt-3 grid gap-2">
          {(
            [
              ["one", "Один человек", "Номер. Шаг 5 или календарь."],
              ["live", "Сейчас ходят", "Шаги 1–5 по живым."],
              ["arch", "Архив клиентов", "Шаги 1–5 по архиву."],
            ] as const
          ).map(([id, title, hint]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setWhoKind(id);
                if (id !== "one") setAct("all");
              }}
              className={cn("rounded-xl px-3 py-2.5 text-left ring-1", whoKind === id ? "bg-black text-white ring-black" : "bg-white ring-black/10")}
            >
              <span className="block text-sm font-semibold">{title}</span>
              <span className={cn("mt-0.5 block text-[0.75rem]", whoKind === id ? "text-white/75" : "text-muted")}>{hint}</span>
            </button>
          ))}
        </div>
      ) : null}
      {step === 1 ? (
        one ? (
          <div className="mt-3 grid gap-2">
            <button type="button" onClick={() => setAct("audit")} className={cn("rounded-xl px-3 py-2.5 text-left ring-1", act === "audit" ? "bg-black text-white ring-black" : "bg-white ring-black/10")}>
              <span className="block text-sm font-semibold">Шаг 5 · сверка</span>
              <span className={cn("mt-0.5 block text-[0.75rem]", act === "audit" ? "text-white/75" : "text-muted")}>Календарь и кассу не трогает.</span>
            </button>
            <button type="button" onClick={() => setAct("calendar")} className={cn("rounded-xl px-3 py-2.5 text-left ring-1", act === "calendar" ? "bg-black text-white ring-black" : "bg-white ring-black/10")}>
              <span className="block text-sm font-semibold">Календарь</span>
              <span className={cn("mt-0.5 block text-[0.75rem]", act === "calendar" ? "text-white/75" : "text-muted")}>Синяя перепроверка только его.</span>
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm">Шаги 1–5: состав, календарь, группы, касса, сверка. Очередь одна.</p>
        )
      ) : null}
      {step === 2 ? (
        <>
          {one ? (
            <input
              className="mt-3 h-10 w-full rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
              placeholder="номер, например 4324"
              value={who}
              onChange={(e) => setWho(e.target.value)}
            />
          ) : null}
          {one && act === "audit" ? <p className="mt-3 text-sm text-muted">Окно лет шагу 5 не нужно.</p> : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PLAN_FROM_OPTS.map((o) => (
                <Chip key={o.id} on={from === o.id} onClick={() => setFrom(o.id)}>{o.label}</Chip>
              ))}
            </div>
          )}
          {whoKind === "live" ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip on={leads} onClick={() => setLeads((v) => !v)}>Лиды действующих групп</Chip>
              <Chip on={archGroups} onClick={() => setArchGroups((v) => !v)}>Архив действующих групп</Chip>
            </div>
          ) : null}
        </>
      ) : null}
      {step === 3 ? (
        <p className="mt-3 text-sm">
          {one
            ? `№${cid || "—"} · ${act === "calendar" ? "календарь" : "шаг 5"}${act === "calendar" ? ` · ${PLAN_FROM_OPTS.find((o) => o.id === from)?.label}` : ""}`
            : `${whoKind === "arch" ? "Архив" : "Сейчас ходят"} · шаги 1–5 · ${PLAN_FROM_OPTS.find((o) => o.id === from)?.label}`}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        {step > 0 ? (
          <button type="button" className="h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-black/10" onClick={() => setStep(step - 1)}>Назад</button>
        ) : null}
        {step < 3 ? (
          <button type="button" disabled={!canNext} className="h-9 rounded-full bg-black px-4 text-sm font-semibold text-white" onClick={() => setStep(step + 1)}>Дальше</button>
        ) : (
          <button
            type="button"
            disabled={busy || run || (one ? !cid || !onRunOne : !onRunAuto)}
            className="h-9 rounded-full bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
            onClick={go}
          >
            Запустить
          </button>
        )}
      </div>
      {run ? <p className="mt-2 text-[0.75rem] text-amber-800">Уже идёт загрузка. Сначала Стоп на шаге.</p> : null}
    </div>
  );
}

export function HistoryPlanPanel({
  policy,
  job,
  busy,
  planLog,
  historyWorker,
  onSave,
  onRunAuto,
  onRunOne,
}: {
  policy: CrmSyncPolicy;
  job?: JobSnap | null;
  busy?: boolean;
  planLog?: PlanLogRow[];
  historyWorker?: { at?: string; silent?: boolean };
  onSave: (next: CrmSyncPolicy) => void;
  onRunAuto?: (opts: { study: "1" | "2"; dateFromId: PlanFromId; leads?: boolean; archGroups?: boolean }) => void;
  onRunOne?: (opts: { cid: number; kind: "audit" | "calendar"; dateFromId: PlanFromId }) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState("");
  const [screen, setScreen] = useState<"home" | "now" | "plan" | "log">("home");
  const [menuId, setMenuId] = useState("");
  const nextLine = useMemo(() => {
    if (!policy.planEnabled) return "синхронизация расписания выкл — слоты не стартуют";
    const soon = policy.plan
      .filter((r) => r.on)
      .map((r) => ({ r, at: nextSlotAt(r) }))
      .filter((x) => x.at)
      .sort((a, b) => (a.at!.getTime() || 0) - (b.at!.getTime() || 0))[0];
    if (!soon) return "расписаний нет";
    return `следующее: ${soon.r.label || planModeMeta(soon.r.mode).label} · ${fmtSlot(soon.r)}`;
  }, [policy]);
  const run = Boolean(job?.running) && !job?.stop;
  const editing = editId ? policy.plan.find((r) => r.id === editId) || null : null;
  const formOpen = adding || Boolean(editing);

  function patch(next: CrmSyncPolicy) {
    onSave(next);
  }

  function move(id: string, dir: -1 | 1) {
    const i = policy.plan.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= policy.plan.length) return;
    const plan = policy.plan.slice();
    const [row] = plan.splice(i, 1);
    plan.splice(j, 0, row);
    patch({ ...policy, plan });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={policy.planEnabled}
          disabled={busy}
          onClick={() => patch({ ...policy, planEnabled: !policy.planEnabled })}
          className={cn(
            "relative h-6 w-11 shrink-0 appearance-none border-0 p-0 rounded-full transition disabled:opacity-50",
            policy.planEnabled ? "bg-emerald-700" : "bg-black/15",
          )}
        >
          <span className={cn("pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", policy.planEnabled && "translate-x-5")} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{run ? `Сейчас: ${job?.cur || "работаем"} · ${job?.n || 0}/${job?.total || 0}` : nextLine}</p>
          {historyWorker?.silent ? <p className="text-[0.75rem] text-red-800">Процесс истории молчит — ночные слоты не поедут.</p> : null}
        </div>
        {screen !== "home" ? (
          <button type="button" className="h-8 shrink-0 rounded-full px-3 text-[0.78rem] font-semibold ring-1 ring-black/10" onClick={() => { setScreen("home"); setAdding(false); setEditId(""); }}>
            К пульту
          </button>
        ) : (
          <button type="button" className="h-8 shrink-0 rounded-full px-3 text-[0.78rem] font-semibold text-red-700 ring-1 ring-red-200" disabled={busy} onClick={() => {
            if (!window.confirm("Сбросить настройки пульта? Синхронизация расписания выкл, расписания удалятся. Текущая загрузка не остановится.")) return;
            patch({ planEnabled: false, plan: [] });
          }}>
            Сброс
          </button>
        )}
      </div>

      {screen === "home" ? (
        <div className="grid gap-2">
          {(
            [
              ["now", "Сейчас", "Один человек или шаги 1–5."],
              ["plan", "Расписание", policy.plan.length ? `${policy.plan.filter((r) => r.on).length} вкл · само, без конца` : "Слотов нет"],
              ["log", "Журнал", "Последние синхронизации и сбои."],
            ] as const
          ).map(([id, title, hint]) => (
            <button key={id} type="button" onClick={() => setScreen(id)} className="rounded-2xl bg-surface-2 px-4 py-3 text-left ring-1 ring-black/5 hover:bg-black/[0.03]">
              <span className="block text-sm font-semibold">{title}</span>
              <span className="mt-0.5 block text-[0.78rem] text-muted">{hint}</span>
            </button>
          ))}
        </div>
      ) : null}

      {screen === "now" ? <NowWizard busy={busy} run={run} onRunAuto={onRunAuto} onRunOne={onRunOne} /> : null}

      {screen === "log" ? (
        <div className="rounded-2xl px-4 py-3 ring-1 ring-black/8">
          <p className="text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">Последние синхронизации</p>
          {(() => {
            const rows = planLogSessions(planLog || [], 10);
            if (!rows.length) return <p className="mt-2 text-[0.78rem] text-muted">Ещё не было. Старт, стоп и сбои появятся здесь.</p>;
            return (
              <ul className="mt-2 space-y-1.5">
                {rows.map((e, i) => (
                  <li key={`${e.at}-${e.kind}-${i}`} className="text-[0.78rem] leading-snug">
                    <span className="font-semibold">{logWhen(e.at)}</span>
                    <span className="text-muted"> · {LOG_KIND[e.kind || ""] || e.kind}</span>
                    {e.src === "plan" ? <span className="text-muted"> · слот</span> : e.src === "hands" ? <span className="text-muted"> · руками</span> : null}
                    <span> · {e.text}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
          <p className="mt-3 text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">События</p>
          {!(planLog || []).length ? (
            <p className="mt-2 text-[0.78rem] text-muted">Пусто.</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              {(planLog || []).slice(0, 24).map((e, i) => (
                <li key={`${e.at}-${e.kind}-ev-${i}`} className={cn("text-[0.78rem] leading-snug", e.kind === "fail" || e.kind === "stop" ? "text-red-800" : e.kind === "skip" ? "text-amber-800" : "")}>
                  <span className="font-semibold">{logWhen(e.at)}</span>
                  <span className="text-muted"> · {LOG_KIND[e.kind || ""] || e.kind}</span>
                  <span> · {e.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {screen === "plan" ? (
        <>
          {formOpen ? (
            <DraftForm
              key={editing?.id || "new"}
              busy={busy}
              seed={editing}
              onCancel={() => { setAdding(false); setEditId(""); }}
              onSave={(row) => {
                if (editing) {
                  patch({
                    ...policy,
                    plan: policy.plan.map((x) =>
                      x.id === editing.id
                        ? { ...x, ...row, on: x.on, dueAt: x.dueAt, lastFiredAt: x.lastFiredAt, lastJobId: x.lastJobId, lastSkip: x.lastSkip }
                        : x,
                    ),
                  });
                } else {
                  const id = `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                  patch({ ...policy, plan: [...policy.plan, { ...row, id, dueAt: "", lastFiredAt: "", lastJobId: "", lastSkip: "" }] });
                }
                setAdding(false);
                setEditId("");
              }}
            />
          ) : (
            <>
              {policy.plan.some((r) => r.when.kind === "ymd") ? (
                <ul className="rounded-2xl px-4 py-3 ring-1 ring-black/8">
                  {policy.plan.filter((r) => r.when.kind === "ymd").map((r) => (
                    <li key={r.id} className="text-[0.78rem]">
                      {r.when.kind === "ymd" ? r.when.date : ""} · {r.at} · {r.label || planModeMeta(r.mode).label}
                      {r.on ? "" : " · пауза"}
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="divide-y divide-black/5 rounded-2xl px-4 ring-1 ring-black/8">
                {policy.plan.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.on}
                        disabled={busy}
                        onClick={() => patch({ ...policy, plan: policy.plan.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)) })}
                        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full", r.on ? "bg-emerald-700" : "bg-black/15")}
                      >
                        <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", r.on && "translate-x-5")} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{r.label || planModeMeta(r.mode).label}</p>
                        <p className="truncate text-[0.75rem] text-muted">
                          {r.when.kind === "ymd"
                            ? `${whenLabel(r.when)} · ${r.at} · один раз`
                            : `${whenLabel(r.when)} · ${r.at} · без конца · ближайший ${fmtSlot(r)}`}
                          {r.study === "2" ? " · архив" : ""}
                          {r.lastSkip === "hands" ? " · руки заняли" : ""}
                          {r.lastSkip === "expired" ? " · слот сгорел" : ""}
                        </p>
                      </div>
                      <button type="button" className="h-8 rounded-full px-3 text-[0.78rem] font-semibold ring-1 ring-black/10" disabled={busy} onClick={() => { setMenuId(""); setEditId(r.id); setAdding(false); }}>
                        Править
                      </button>
                      <button type="button" className="h-8 rounded-full px-3 text-[0.78rem] font-semibold ring-1 ring-black/10" onClick={() => setMenuId(menuId === r.id ? "" : r.id)}>
                        Ещё
                      </button>
                    </div>
                    {menuId === r.id ? (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-14">
                        <button type="button" className="h-8 rounded-full px-3 text-[0.78rem] ring-1 ring-black/10" disabled={busy} onClick={() => move(r.id, -1)}>Выше</button>
                        <button type="button" className="h-8 rounded-full px-3 text-[0.78rem] ring-1 ring-black/10" disabled={busy} onClick={() => move(r.id, 1)}>Ниже</button>
                        <button type="button" className="h-8 rounded-full px-3 text-[0.78rem] ring-1 ring-black/10" disabled={busy} onClick={() => {
                          const id = `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                          patch({
                            ...policy,
                            plan: [...policy.plan, { ...r, id, label: r.label ? `${r.label} · копия` : "копия", dueAt: "", lastFiredAt: "", lastJobId: "", lastSkip: "" }],
                          });
                          setMenuId("");
                        }}>Копия</button>
                        <button type="button" className="h-8 rounded-full px-3 text-[0.78rem] font-semibold text-red-700 ring-1 ring-red-200" disabled={busy} onClick={() => {
                          if (!window.confirm("Удалить это расписание?")) return;
                          patch({ ...policy, plan: policy.plan.filter((x) => x.id !== r.id) });
                          setMenuId("");
                        }}>Удалить</button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {!policy.plan.length ? <p className="text-sm text-muted">Расписаний нет. Ночью пульт молчит.</p> : null}
              <button type="button" className="h-10 rounded-full bg-black px-4 text-sm font-semibold text-white" onClick={() => { setEditId(""); setAdding(true); }}>
                + Добавить расписание
              </button>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

export function HistoryPlanModal({
  open,
  onClose,
  policy,
  job,
  busy,
  onSave,
  onRunAuto,
  onRunOne,
  planLog,
  historyWorker,
}: {
  open: boolean;
  onClose: () => void;
  policy: CrmSyncPolicy;
  job?: JobSnap | null;
  busy?: boolean;
  onSave: (next: CrmSyncPolicy) => void;
  onRunAuto?: (opts: { study: "1" | "2"; dateFromId: PlanFromId; leads?: boolean; archGroups?: boolean }) => void;
  onRunOne?: (opts: { cid: number; kind: "audit" | "calendar"; dateFromId: PlanFromId }) => void;
  planLog?: PlanLogRow[];
  historyWorker?: { at?: string; silent?: boolean };
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-3 sm:items-center" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-plan-title"
        className="max-h-[min(92vh,56rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p id="history-plan-title" className="font-display text-[1.2rem] leading-tight">
              Пульт синхронизации
            </p>
            <p className="mt-1 text-[0.82rem] text-muted">Три входа: сейчас, расписание, журнал. Запуск и новый слот — по шагам.</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10 hover:bg-black/5"
            onClick={onClose}
            aria-label="Закрыть"
          >
            Закрыть
          </button>
        </div>
        <HistoryPlanPanel policy={policy} job={job} busy={busy} planLog={planLog} historyWorker={historyWorker} onSave={onSave} onRunAuto={onRunAuto} onRunOne={onRunOne} />
      </div>
    </div>
  );
}
