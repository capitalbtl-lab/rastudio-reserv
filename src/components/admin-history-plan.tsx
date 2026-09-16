"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  HISTORY_PLAN_MODES,
  PLAN_FROM_OPTS,
  PLAN_RECHECK_OPTS,
  emptyDraft,
  mskWall,
  nextSlotAt,
  pad2,
  planModeMeta,
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

function DraftForm({
  busy,
  onCancel,
  onSave,
}: {
  busy?: boolean;
  onCancel: () => void;
  onSave: (row: Omit<HistorySchedule, "id" | "dueAt" | "lastFiredAt" | "lastJobId" | "lastSkip">) => void;
}) {
  const base = emptyDraft();
  const [label, setLabel] = useState(base.label);
  const [mode, setMode] = useState<HistoryPlanMode>(base.mode);
  const [kind, setKind] = useState<HistoryWhen["kind"]>("daily");
  const [days, setDays] = useState<number[]>([1]);
  const [every, setEvery] = useState(6);
  const [unit, setUnit] = useState<PlanUnit>("month");
  const [nth, setNth] = useState(1);
  const [nthDay, setNthDay] = useState(1);
  const [date, setDate] = useState("");
  const [at, setAt] = useState("04:00");
  const [recheckDays, setRecheckDays] = useState(7);
  const [fromId, setFromId] = useState<PlanFromId>("2015");
  const [study, setStudy] = useState<"1" | "2">("1");

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

  return (
    <div className="mt-3 rounded-2xl bg-surface-2 p-4 ring-1 ring-black/8">
      <p className="font-display text-[1.05rem]">Новое расписание</p>
      <label className="mt-3 block text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">
        Подпись
        <input
          className="mt-1 h-9 w-full rounded-full bg-white px-3 text-sm font-medium ring-1 ring-black/8"
          value={label}
          placeholder="необязательно"
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label className="mt-3 block text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">
        Режим
        <select
          className="mt-1 h-9 w-full rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
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
      <p className="mt-3 text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">День запуска</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Chip on={kind === "weekly"} onClick={() => setKind("weekly")}>
          Дни недели
        </Chip>
        <Chip on={kind === "daily"} onClick={() => setKind("daily")}>
          Каждый день
        </Chip>
        <Chip on={kind === "interval"} onClick={() => setKind("interval")}>
          Каждые N
        </Chip>
        <Chip on={kind === "nthWeekday"} onClick={() => setKind("nthWeekday")}>
          N-й день месяца
        </Chip>
        <Chip on={kind === "ymd"} onClick={() => setKind("ymd")}>
          Дата
        </Chip>
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
          <span className="text-sm font-semibold">каждые</span>
          <input
            type="number"
            min={1}
            max={36}
            className="h-9 w-16 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
            value={every}
            onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))}
          />
          <select
            className="h-9 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
            value={unit}
            onChange={(e) => setUnit(e.target.value as PlanUnit)}
          >
            <option value="day">дней</option>
            <option value="week">недель</option>
            <option value="month">месяцев</option>
          </select>
          <span className="text-[0.75rem] text-muted">полгода — 6 месяцев</span>
        </div>
      ) : null}
      {kind === "nthWeekday" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
            value={nth}
            onChange={(e) => setNth(Number(e.target.value))}
          >
            <option value={1}>1-й</option>
            <option value={2}>2-й</option>
            <option value={3}>3-й</option>
            <option value={4}>4-й</option>
            <option value={5}>5-й</option>
            <option value={-1}>последний</option>
          </select>
          <select
            className="h-9 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
            value={nthDay}
            onChange={(e) => setNthDay(Number(e.target.value))}
          >
            {DAYS.map((d) => (
              <option key={d.n} value={d.n}>
                {d.t}
              </option>
            ))}
          </select>
          <span className="text-[0.75rem] text-muted">месяца</span>
        </div>
      ) : null}
      {kind === "ymd" ? (
        <input
          type="date"
          className="mt-2 h-9 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      ) : null}
      <label className="mt-3 block text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">
        Время запуска · МСК
        <input
          type="time"
          step={900}
          className="mt-1 h-9 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
          value={at}
          onChange={(e) => setAt(e.target.value)}
        />
      </label>
      {isRecheck(mode) ? (
        <>
          <p className="mt-3 text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">Окно</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {PLAN_RECHECK_OPTS.map((o) => (
              <Chip key={o.days} on={recheckDays === o.days} onClick={() => setRecheckDays(o.days)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </>
      ) : mode === "auto" || mode === "people" || mode === "people-slow" || mode === "balance" ? (
        <>
          <p className="mt-3 text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">Годы (красная качка)</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(study === "2" ? PLAN_FROM_OPTS.filter((o) => o.id === "1" || o.id === "2") : PLAN_FROM_OPTS).map((o) => (
              <Chip key={o.id} on={fromId === o.id} onClick={() => setFromId(o.id)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
      <p className="mt-3 text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">Кого</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Chip on={study === "1"} onClick={() => setStudy("1")}>
          Сейчас ходят
        </Chip>
        <Chip on={study === "2"} onClick={() => {
          setStudy("2");
          if (fromId !== "1" && fromId !== "2") setFromId("1");
        }}>
          Архив
        </Chip>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-black/10" onClick={onCancel}>
          Отмена
        </button>
        <button
          type="button"
          disabled={busy || !canSave}
          className="h-9 rounded-full bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() =>
            onSave({
              on: true,
              mode,
              when: when(),
              at,
              recheckDays,
              dateFromId: study === "2" && fromId !== "1" && fromId !== "2" ? "1" : fromId,
              study,
              label,
            })
          }
        >
          Сохранить расписание
        </button>
      </div>
      <p className="mt-2 text-[0.75rem] text-muted">Пока синхронизация расписания выкл — карточка лежит и не стартует. «Автомат · полный прогон»: состав → календарь → активные группы → архив действующих групп → касса → сверка. Лиды действующих групп — как галка «Запомнить» на шаге 1.</p>
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
}: {
  policy: CrmSyncPolicy;
  job?: JobSnap | null;
  busy?: boolean;
  planLog?: PlanLogRow[];
  historyWorker?: { at?: string; silent?: boolean };
  onSave: (next: CrmSyncPolicy) => void;
  onRunAuto?: (opts: { study: "1" | "2"; dateFromId: PlanFromId; leads?: boolean; archGroups?: boolean }) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [runStudy, setRunStudy] = useState<"1" | "2">("1");
  const [runFrom, setRunFrom] = useState<PlanFromId>("2015");
  const [runLeads, setRunLeads] = useState(true);
  const [runArchGroups, setRunArchGroups] = useState(true);
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
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
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
          <span
            className={cn(
              "pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
              policy.planEnabled && "translate-x-5",
            )}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Синхронизация расписания</p>
          <p
            className={cn(
              "h-5 truncate text-[0.72rem] leading-5",
              historyWorker?.silent ? "font-semibold text-red-800" : "text-muted",
            )}
          >
            {historyWorker?.silent
              ? "процесс истории молчит больше 2 мин"
              : run
                ? `Сейчас: ${job?.cur || job?.mode || "работаем"} · ${job?.n || 0}/${job?.total || 0}`
                : policy.planEnabled
                  ? policy.plan.some((r) => r.dueAt)
                    ? "вкл · ждёт слот"
                    : policy.plan.some((r) => r.on)
                      ? `вкл · ${nextLine.replace(/^следующее:\s*/i, "")}`
                      : "вкл · расписаний нет"
                  : "выкл · только руками"}
          </p>
        </div>
        <button
          type="button"
          className={cn(
            "h-8 shrink-0 rounded-full px-3 text-[0.78rem] font-semibold ring-1 ring-black/10",
            logOpen ? "bg-black text-white ring-black" : "",
          )}
          onClick={() => setLogOpen((v) => !v)}
        >
          Лог
        </button>
        <button
          type="button"
          className="h-8 shrink-0 rounded-full px-3 text-[0.78rem] font-semibold ring-1 ring-black/10"
          disabled={busy}
          onClick={() => {
            if (!window.confirm("Сбросить настройки пульта? Синхронизация расписания выкл, расписания удалятся. Текущая загрузка не остановится.")) return;
            patch({ planEnabled: false, plan: [] });
          }}
        >
          Сброс настроек
        </button>
      </div>
      {logOpen ? (
        <div className="rounded-2xl px-4 py-3 ring-1 ring-black/8">
          <p className="text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">Последние синхронизации</p>
          {(() => {
            const rows = (planLog || []).filter((e) => e.kind === "start" || e.kind === "done").slice(0, 10);
            if (!rows.length) return <p className="mt-2 text-[0.78rem] text-muted">Ещё не было. Старт, стоп и сбои появятся здесь.</p>;
            return (
              <ul className="mt-2 space-y-1.5">
                {rows.map((e, i) => (
                  <li key={`${e.at}-${e.kind}-${i}`} className="text-[0.78rem] leading-snug">
                    <span className="font-semibold">{logWhen(e.at)}</span>
                    <span className="text-muted"> · {LOG_KIND[e.kind || ""] || e.kind}</span>
                    {e.src === "plan" ? <span className="text-muted"> · слот</span> : e.src === "hands" ? <span className="text-muted"> · руками</span> : null}
                    <span> · {e.text}</span>
                    {e.who ? <span className="text-muted"> · {e.who}{e.cid ? ` №${e.cid}` : ""}</span> : null}
                  </li>
                ))}
              </ul>
            );
          })()}
          <p className="mt-3 text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">События</p>
          {!(planLog || []).length ? (
            <p className="mt-2 text-[0.78rem] text-muted">Пусто. Почему соскочило — будет строкой: ребёнок, причина, шаг.</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              {(planLog || []).slice(0, 24).map((e, i) => (
                <li
                  key={`${e.at}-${e.kind}-ev-${i}`}
                  className={cn(
                    "text-[0.78rem] leading-snug",
                    e.kind === "fail" || e.kind === "stop" ? "text-red-800" : e.kind === "skip" ? "text-amber-800" : "",
                  )}
                >
                  <span className="font-semibold">{logWhen(e.at)}</span>
                  <span className="text-muted"> · {LOG_KIND[e.kind || ""] || e.kind}</span>
                  <span> · {e.text}</span>
                  {e.who && !String(e.text || "").includes(e.who) ? <span> · {e.who}{e.cid ? ` №${e.cid}` : ""}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-black/8">
        <p className="w-full text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">Ручной запуск</p>
        <Chip on={runStudy === "1"} onClick={() => setRunStudy("1")}>
          Сейчас ходят
        </Chip>
        <Chip
          on={runStudy === "2"}
          onClick={() => {
            setRunStudy("2");
            if (runFrom !== "1" && runFrom !== "2") setRunFrom("1");
          }}
        >
          Архив клиентов
        </Chip>
        {runStudy === "1" ? (
          <>
            <Chip on>
              Активные группы
            </Chip>
            <Chip on={runLeads} onClick={() => setRunLeads((v) => !v)}>
              Лиды действующих групп
            </Chip>
            <Chip on={runArchGroups} onClick={() => setRunArchGroups((v) => !v)}>
              Архив действующих групп
            </Chip>
          </>
        ) : null}
        <p className="w-full text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">Годы календаря</p>
        {(runStudy === "2" ? PLAN_FROM_OPTS.filter((o) => o.id === "1" || o.id === "2") : PLAN_FROM_OPTS).map((o) => (
          <Chip key={o.id} on={runFrom === o.id} onClick={() => setRunFrom(o.id)}>
            {o.label}
          </Chip>
        ))}
        <button
          type="button"
          className="h-9 rounded-full bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy || run || !onRunAuto}
          onClick={() => {
            if (!onRunAuto) return;
            if (run) return;
            if (!window.confirm("Запустить полный прогон сейчас? Состав → календарь → активные группы → архив действующих групп (если чип) → касса → сверка. Галка лидов на шаге 1 не меняется.")) return;
            onRunAuto({
              study: runStudy,
              dateFromId: runStudy === "2" && runFrom !== "1" && runFrom !== "2" ? "1" : runFrom,
              leads: runStudy === "1" && runLeads,
              archGroups: runStudy === "1" && runArchGroups,
            });
          }}
        >
          Запустить шаги 1–5 сейчас
        </button>
      </div>

      {!policy.plan.length && !adding ? (
        <p className="text-sm text-muted">Расписаний нет. Синхронизация расписания молчит. Кнопки шагов как были.</p>
      ) : null}

      {policy.plan.map((r) => (
        <div key={r.id} className="rounded-2xl px-4 py-3 ring-1 ring-black/8">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{r.label || planModeMeta(r.mode).label}</p>
              <p className="mt-0.5 text-[0.78rem] text-muted">
                {whenLabel(r.when)} · {r.at} МСК
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" className="h-8 rounded-full px-2 text-sm ring-1 ring-black/10" onClick={() => move(r.id, -1)} disabled={busy}>
                ↑
              </button>
              <button type="button" className="h-8 rounded-full px-2 text-sm ring-1 ring-black/10" onClick={() => move(r.id, 1)} disabled={busy}>
                ↓
              </button>
              <label className="flex items-center gap-1.5 px-2 text-[0.78rem] font-semibold">
                <input type="checkbox" checked={r.on} disabled={busy} onChange={(e) => patch({ ...policy, plan: policy.plan.map((x) => (x.id === r.id ? { ...x, on: e.target.checked } : x)) })} />
                вкл
              </label>
              <button
                type="button"
                className="h-8 rounded-full px-3 text-[0.78rem] font-semibold text-red-700 ring-1 ring-red-200"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Удалить это расписание?")) return;
                  patch({ ...policy, plan: policy.plan.filter((x) => x.id !== r.id) });
                }}
              >
                Удалить
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="h-7 rounded-full bg-black px-2.5 text-[0.72rem] font-semibold leading-7 text-white">{planModeMeta(r.mode).label}</span>
            {isRecheck(r.mode) ? (
              <span className="h-7 rounded-full bg-sky-50 px-2.5 text-[0.72rem] font-semibold leading-7">
                {PLAN_RECHECK_OPTS.find((o) => o.days === r.recheckDays)?.label || `± ${r.recheckDays}`}
              </span>
            ) : r.mode === "auto" || r.mode === "people" || r.mode === "people-slow" || r.mode === "balance" ? (
              <span className="h-7 rounded-full bg-sky-50 px-2.5 text-[0.72rem] font-semibold leading-7">
                {PLAN_FROM_OPTS.find((o) => o.id === r.dateFromId)?.label || r.dateFromId}
              </span>
            ) : null}
            <span className="h-7 rounded-full bg-surface-2 px-2.5 text-[0.72rem] font-semibold leading-7">{r.study === "2" ? "Архив" : "Сейчас ходят"}</span>
          </div>
          <p className="mt-2 text-[0.72rem] text-muted">
            следующий слот {fmtSlot(r)}
            {r.lastSkip === "hands" ? " · пропуск: руки заняли" : ""}
            {r.lastSkip === "expired" ? " · слот сгорел (старше 36 ч)" : ""}
          </p>
        </div>
      ))}

      {adding ? (
        <DraftForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={(row) => {
            const id = `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            patch({
              ...policy,
              plan: [...policy.plan, { ...row, id, dueAt: "", lastFiredAt: "", lastJobId: "", lastSkip: "" }],
            });
            setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="h-10 rounded-full bg-black px-4 text-sm font-semibold text-white"
          onClick={() => setAdding(true)}
        >
          + Добавить расписание
        </button>
      )}
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
            <p className="mt-1 text-[0.82rem] text-muted">Расписание — само в слот. «Запустить шаги 1–5 сейчас» — полный прогон руками, тумблер не нужен. Лиды — как на шаге 1, галку не затираем.</p>
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
        <HistoryPlanPanel policy={policy} job={job} busy={busy} planLog={planLog} historyWorker={historyWorker} onSave={onSave} onRunAuto={onRunAuto} />
      </div>
    </div>
  );
}
