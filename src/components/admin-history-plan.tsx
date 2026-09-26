"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  HISTORY_PLAN_MODES,
  PLAN_FROM_OPTS,
  PLAN_RECHECK_OPTS,
  CHECK_STEP_LABEL,
  CHECK_WHO_LABEL,
  applyTemplateToSlots,
  checkBand,
  checkCode,
  checkRunFields,
  checkStepWhy,
  mskWall,
  nextCheckNum,
  nextSlotAt,
  pad2,
  planFromIdToRecheckDays,
  planModeMeta,
  planLogSessions,
  whenLabel,
  STEP6_PIPE,
  type CheckAudience,
  type CheckDepth,
  type CheckTemplate,
  type CrmSyncPolicy,
  type HistoryPlanMode,
  type HistorySchedule,
  type HistoryWhen,
  type PlanFromId,
  type PlanUnit,
} from "@/data/crm-sync-policy-core";

type PlanPerson = { cid: number; name: string };

function foldName(s: string) {
  return s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function matchPeople(people: PlanPerson[], raw: string) {
  const q = foldName(raw);
  if (q.length < 2 && !/^\d+$/.test(q)) return [];
  const words = q.split(" ").filter(Boolean);
  const digits = /^\d+$/.test(q);
  const out: PlanPerson[] = [];
  const seen = new Set<number>();
  for (const p of people) {
    if (!p.cid || seen.has(p.cid)) continue;
    const name = foldName(p.name || "");
    const ok = digits ? String(p.cid).includes(q) : words.every((w) => name.includes(w) || String(p.cid).includes(w));
    if (!ok) continue;
    seen.add(p.cid);
    out.push(p);
    if (out.length >= 8) break;
  }
  return out;
}

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
        "h-8 rounded-full px-3 text-[0.78rem] font-medium transition",
        on ? "bg-black text-white" : "bg-black/[0.04] text-black/80 hover:bg-black/[0.07]",
        disabled && "opacity-50",
      )}
    >
      {children}
    </button>
  );
}

function Switch({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40", on ? "bg-emerald-600" : "bg-black/15")}
    >
      <span className={cn("absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform", on && "translate-x-5")} />
    </button>
  );
}

function Dots({ n, i }: { n: number; i: number }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: n }, (_, k) => (
        <span key={k} className={cn("h-1 rounded-full", k === i ? "w-5 bg-black" : k < i ? "w-1.5 bg-black/40" : "w-1.5 bg-black/15")} />
      ))}
    </span>
  );
}

function fmtSlot(rule: HistorySchedule) {
  if (rule.dueAt) return "в очереди";
  const d = nextSlotAt(rule);
  if (!d) return "слота нет";
  const w = mskWall(d);
  return `${pad2(w.d)}.${pad2(w.mo)} ${pad2(w.h)}:${pad2(w.min)} МСК`;
}

const STEP_CHIPS: [number, string][] = [
  [1, "1 состав"],
  [2, "2 календарь"],
  [3, "3 группы"],
  [4, "4 касса"],
  [5, "5 сверка"],
  [6, "6 лиды"],
  [7, "7 архив"],
];

function StepPick({
  steps,
  also,
  onSteps,
  onAlso,
}: {
  steps: number[];
  also: string[];
  onSteps: (n: number) => void;
  onAlso: (id: string) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-[0.72rem] font-medium text-muted">Какие шаги</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {STEP_CHIPS.map(([n, label]) => (
          <Chip key={n} on={steps.includes(n)} onClick={() => onSteps(n)}>{label}</Chip>
        ))}
      </div>
      <p className="mt-2 text-[0.72rem] font-medium text-muted">Шаг 6 по частям</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {STEP6_PIPE.map((id) => (
          <Chip key={id} on={also.includes(id)} onClick={() => onAlso(id)}>
            {id === "step6-recount" ? "пересчет лидов" : id === "step6-columns" ? "колонки" : "касса лидов"}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function defaultSteps(mode: string): number[] {
  if (mode === "auto") return [1, 2, 3, 4, 5];
  if (mode.startsWith("roster")) return [1];
  if (mode.startsWith("people")) return [2];
  if (mode.startsWith("groups")) return [3];
  if (mode === "balance") return [4];
  if (mode === "audit") return [5];
  return [];
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
    steps: seed?.steps?.length ? seed.steps : defaultSteps(seed?.mode || "auto"),
    also: seed?.also || [],
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
  const [stepsOn, setStepsOn] = useState<number[]>(init.steps);
  const [also, setAlso] = useState<string[]>(init.also);

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
    (kind !== "ymd" || Boolean(date)) &&
    (stepsOn.length > 0 || also.length > 0 || mode.startsWith("step6"));

  const [step, setStep] = useState(0);
  const titles = ["Что запускать", "Когда", "Кого", "Сохранить"];

  return (
    <div className="rounded-[1.25rem] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <Dots n={titles.length} i={step} />
        <p className="text-[0.72rem] text-muted">{seed ? "правка" : "новое"}</p>
      </div>
      <p className="mt-3 font-display text-[1.35rem] leading-none">{titles[step]}</p>
      {step === 0 ? (
        <>
        <label className="mt-3 block text-sm font-semibold">
          Режим
          <select
            className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
            value={mode}
            onChange={(e) => {
              const next = e.target.value as HistoryPlanMode;
              setMode(next);
              setStepsOn(defaultSteps(next));
            }}
          >
            {HISTORY_PLAN_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <StepPick
          steps={stepsOn}
          also={also}
          onSteps={(n) => setStepsOn((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort((a, b) => a - b)))}
          onAlso={(id) => setAlso((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
        />
        </>
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
            {planModeMeta(mode).label}. Шаги: {stepsOn.length ? stepsOn.join(", ") : "нет"}. {whenLabel(when())}, {at} МСК. {study === "2" ? "Архив." : "Сейчас ходят."}
            {mode === "auto" || mode === "people" || mode === "people-slow" || mode === "balance"
              ? ` Окно: ${PLAN_FROM_OPTS.find((o) => o.id === fromId)?.label || ""}.`
              : isRecheck(mode)
                ? ` Окно: ${PLAN_RECHECK_OPTS.find((o) => o.days === recheckDays)?.label || ""}.`
                : ""}
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
                steps: stepsOn,
                also,
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

const WHO_ORDER: CheckAudience[] = ["one", "live", "leads-in", "leads-out", "arch-in", "arch-out"];
const ALSO_ORDER = ["step6-columns", "step6-cash", "step7-list", "step7-cash"] as const;
const ALSO_LABEL: Record<string, string> = {
  "step6-columns": "Колонки лидов",
  "step6-cash": "Касса лида",
  "step7-list": "Прочитать архив",
  "step7-cash": "Касса архива",
};

export type CheckRun = {
  one: boolean;
  cid: number;
  personName: string;
  leads: boolean;
  archGroups: boolean;
  steps: number[];
  also: string[];
  dateFromId: PlanFromId;
  depth: CheckDepth;
  templateId: string;
  meaning: string;
  who: string;
  window: string;
};

function blankCheck(): CheckTemplate {
  return {
    id: "",
    num: 0,
    seed: "",
    name: "",
    meaning: "",
    audience: [],
    steps: [],
    also: [],
    dateFromId: "1",
    depth: "recheck",
    cid: 0,
    on: true,
    createdAt: "",
    updatedAt: "",
  };
}

function whoLine(audience: CheckAudience[]) {
  return audience.map((id) => CHECK_WHO_LABEL[id]).join(", ");
}

function stepLine(steps: number[], also: string[]) {
  return [...steps.map((n) => CHECK_STEP_LABEL[n] || String(n)), ...also.map((id) => ALSO_LABEL[id] || id)].join(", ");
}

function CheckEditor({
  busy,
  run,
  people,
  seedPerson,
  draft,
  onRun,
  onSaveTemplate,
}: {
  busy?: boolean;
  run?: boolean;
  people?: PlanPerson[];
  seedPerson?: PlanPerson | null;
  draft: CheckTemplate;
  onRun?: (opts: CheckRun) => void;
  onSaveTemplate: (row: CheckTemplate) => void;
}) {
  const [audience, setAudience] = useState<CheckAudience[]>(draft.audience);
  const [stepsOn, setStepsOn] = useState<number[]>(draft.steps);
  const [also, setAlso] = useState<string[]>(draft.also);
  const [from, setFrom] = useState<PlanFromId>(draft.dateFromId || "1");
  const [depth, setDepth] = useState<CheckDepth>(draft.depth === "full" ? "full" : "recheck");
  const [name, setName] = useState(draft.name === "Проверка" ? "" : draft.name);
  const [meaning, setMeaning] = useState(draft.meaning);
  const [who, setWho] = useState(seedPerson?.name || "");
  const [picked, setPicked] = useState<PlanPerson | null>(seedPerson?.cid ? seedPerson : null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setStepsOn((cur) => {
      const next = cur.filter((n) => !checkStepWhy(audience, n));
      return next.length === cur.length ? cur : next;
    });
    setAlso((cur) => {
      const next = cur.filter((id) => !checkStepWhy(audience, id.startsWith("step7") ? 7 : 6));
      return next.length === cur.length ? cur : next;
    });
  }, [audience]);
  const hits = matchPeople(people || [], who);
  const q = who.trim();
  const numeric = /^\d+$/.test(q);
  const exact = numeric ? (people || []).find((p) => String(p.cid) === q) : undefined;
  const typedId = exact ? exact.cid : numeric && hits.length === 0 && q.length >= 3 ? Number(q) : 0;
  const cid = typedId || (picked && foldName(picked.name) === foldName(who) ? picked.cid : 0) || (!numeric && hits.length === 1 ? hits[0].cid : 0);
  const pickedName = picked && picked.cid === cid ? picked.name : hits.find((p) => p.cid === cid)?.name || (exact?.name || "");
  const band = checkBand(audience);
  const onlyOne = audience.length === 1 && audience[0] === "one";
  const withWalkers = audience.includes("one") && audience.some((id) => id === "live" || id === "leads-in" || id === "arch-in");
  const windowOn = stepsOn.some((n) => n === 2 || n === 3 || n === 4);
  const legalSteps = stepsOn.filter((n) => !checkStepWhy(audience, n));
  const legalAlso = also.filter((id) => !checkStepWhy(audience, id.startsWith("step7") ? 7 : 6));
  const whyLine =
    band === "empty" || band === "mix"
      ? checkStepWhy(audience, 1)
      : [1, 2, 3, 4, 5, 6, 7].map((n) => checkStepWhy(audience, n)).find(Boolean) || "";

  function toggleWho(id: CheckAudience) {
    setErr("");
    setAudience((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function toggleStep(n: number) {
    const why = checkStepWhy(audience, n);
    if (why) return;
    setErr("");
    setStepsOn((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort((a, b) => a - b)));
  }

  function toggleAlso(id: string) {
    const why = checkStepWhy(audience, id.startsWith("step7") ? 7 : 6);
    if (why) return;
    setErr("");
    setAlso((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function askFull() {
    if (depth === "full") {
      setDepth("recheck");
      return;
    }
    const ok = window.confirm(
      "С нуля не стирает диск и не пишет в Alfa. Уже лежащие уроки и платежи не удаляются. По школе пойдут только те, у кого шаг ещё пустой. У одного человека дописывается недостающее, без сноса того, что уже лежит.",
    );
    if (ok) setDepth("full");
  }

  function build(): CheckTemplate | null {
    if (band === "empty") {
      setErr("Сначала отметьте, кого проверять.");
      return null;
    }
    if (band === "mix") {
      setErr("Это разные проверки. Снимите лишнюю галку или сделайте два шаблона.");
      return null;
    }
    if (!legalSteps.length && !legalAlso.length) {
      setErr("Отметьте хотя бы один шаг.");
      return null;
    }
    return {
      ...draft,
      name: name.trim() || "Проверка",
      meaning: meaning.trim(),
      audience,
      steps: legalSteps,
      also: legalAlso,
      dateFromId: from,
      depth,
      cid: onlyOne ? cid : 0,
      on: draft.on !== false,
    };
  }

  function save() {
    const row = build();
    if (!row) return;
    if (!row.meaning.trim()) {
      setErr("Напишите, когда применять эту проверку.");
      return;
    }
    onSaveTemplate(row);
  }

  function go() {
    const row = build();
    if (!row || !onRun) return;
    if (onlyOne && !cid) {
      setErr("Напишите фамилию или номер.");
      return;
    }
    const whoText = whoLine(row.audience);
    const win = PLAN_FROM_OPTS.find((o) => o.id === from)?.label || "";
    const ask =
      depth === "full"
        ? "С нуля не стирает диск и не пишет в Alfa. Уже лежащие строки не удаляются. По школе пойдут только пустые шаги. Запустить?"
        : "Перепроверить: дописать недостающее. Уже лежащие строки не стираем. В Alfa не пишем. Запустить?";
    if (!window.confirm(ask)) return;
    const fields = checkRunFields(row);
    onRun({
      one: fields.one,
      cid,
      personName: pickedName || (cid ? `№${cid}` : ""),
      leads: fields.leads,
      archGroups: fields.archGroups,
      steps: fields.steps,
      also: fields.also,
      dateFromId: from,
      depth,
      templateId: draft.id,
      meaning: row.meaning,
      who: whoText,
      window: windowOn ? win : "",
    });
  }

  const canWork = band !== "empty" && band !== "mix" && (legalSteps.length > 0 || legalAlso.length > 0);

  return (
    <div className="rounded-[1.25rem] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
      <p className="font-display text-[1.35rem] leading-none">{draft.id ? checkCode(draft.num) : "Проверка"}</p>
      <p className="mt-2 text-sm text-muted">Очередь одна. В Alfa не пишем. Шаги идут по порядку, не как отметили.</p>
      <p className="mt-4 text-[0.72rem] font-medium text-muted">Кого</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {WHO_ORDER.map((id) => (
          <Chip key={id} on={audience.includes(id)} onClick={() => toggleWho(id)}>{CHECK_WHO_LABEL[id]}</Chip>
        ))}
      </div>
      {whyLine && (band === "empty" || band === "mix") ? <p className="mt-2 text-sm text-muted">{whyLine}</p> : null}
      {withWalkers ? <p className="mt-2 text-sm text-muted">Один человек вместе с ходящими — это проверка всех отмеченных, не одного номера.</p> : null}
      {audience.includes("leads-in") && !audience.includes("live") && legalSteps.length ? (
        <p className="mt-2 text-sm text-muted">Шаги 1–5 идут по всем, кто в группе, не только по лидам. Для одних лидов оставьте колонки и кассу лида.</p>
      ) : null}
      {audience.includes("one") ? (
        <div className="relative mt-3">
          <input
            className="h-10 w-full rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8"
            placeholder="фамилия или номер"
            value={who}
            onChange={(e) => {
              setWho(e.target.value);
              setPicked(null);
              setErr("");
            }}
          />
          {who.trim() && hits.length > 1 ? (
            <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/10">
              {hits.map((p) => (
                <li key={p.cid}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-black/[0.04]"
                    onClick={() => {
                      setPicked(p);
                      setWho(p.name);
                    }}
                  >
                    {p.name} <span className="text-muted">№{p.cid}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {cid && pickedName ? <p className="mt-2 text-[0.75rem] text-muted">{pickedName} · №{cid}</p> : null}
          {who.trim() && !cid ? <p className="mt-2 text-[0.75rem] text-muted">{(people || []).length ? "Выберите строку." : "Список ещё не загружен — введите номер."}</p> : null}
        </div>
      ) : null}
      <p className="mt-4 text-[0.72rem] font-medium text-muted">Какие шаги</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const why = checkStepWhy(audience, n);
          return (
            <Chip key={n} on={stepsOn.includes(n)} disabled={Boolean(why)} onClick={() => toggleStep(n)}>
              {CHECK_STEP_LABEL[n]}
            </Chip>
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ALSO_ORDER.map((id) => {
          const why = checkStepWhy(audience, id.startsWith("step7") ? 7 : 6);
          return (
            <Chip key={id} on={also.includes(id)} disabled={Boolean(why)} onClick={() => toggleAlso(id)}>
              {ALSO_LABEL[id]}
            </Chip>
          );
        })}
      </div>
      {whyLine && band !== "empty" && band !== "mix" ? <p className="mt-2 text-sm text-muted">{whyLine}</p> : null}
      <p className="mt-4 text-[0.72rem] font-medium text-muted">Окно</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {PLAN_FROM_OPTS.map((o) => (
          <Chip key={o.id} on={windowOn && from === o.id} disabled={!windowOn} onClick={() => windowOn && setFrom(o.id)}>{o.label}</Chip>
        ))}
      </div>
      {!windowOn ? (
        <p className="mt-2 text-sm text-muted">
          {legalSteps.includes(5) && !legalSteps.some((n) => n === 2 || n === 3 || n === 4)
            ? "Годы не фильтруют сверку остатка."
            : "Окно нужно календарю, занятиям групп и кассе на диск."}
        </p>
      ) : null}
      <p className="mt-4 text-[0.72rem] font-medium text-muted">Как читать</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Chip on={depth === "recheck"} onClick={() => setDepth("recheck")}>Перепроверить</Chip>
        <Chip on={depth === "full"} onClick={askFull}>С нуля</Chip>
      </div>
      <p className="mt-2 text-sm text-muted">
        {depth === "full"
          ? "С нуля не стирает диск. По школе читаются только пустые шаги. Уже лежащие уроки и платежи остаются. В Alfa не пишем."
          : "Перепроверить дописывает недостающее в окне и не стирает уже лежащие строки. В Alfa не пишем."}
      </p>
      <label className="mt-4 block text-sm font-semibold">
        Название
        <input className="mt-1 h-10 w-full rounded-xl bg-white px-3 text-sm font-medium ring-1 ring-black/8" value={name} placeholder="например, Один ученик за год" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        Когда применять
        <textarea className="mt-1 min-h-20 w-full rounded-xl bg-white px-3 py-2 text-sm font-medium ring-1 ring-black/8" value={meaning} placeholder="Одно-три предложения: кого и зачем." onChange={(e) => setMeaning(e.target.value)} />
      </label>
      <p className="mt-1 text-[0.75rem] text-muted">Это текст на карточке шаблона. Без него шаблон не сохраняется.</p>
      {err ? <p className="mt-2 text-sm text-red-800">{err}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy || run || !onRun || !canWork || (onlyOne && !cid)} className="h-9 rounded-full bg-black px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={go}>
          Запустить сейчас
        </button>
        <button type="button" disabled={busy || !meaning.trim() || !canWork} className="h-9 rounded-full px-4 text-sm font-semibold ring-1 ring-black/10 disabled:opacity-50" onClick={save}>
          Сохранить шаблон
        </button>
      </div>
      {run ? <p className="mt-2 text-[0.75rem] text-amber-800">Уже идёт загрузка. Сначала Стоп на шаге.</p> : null}
    </div>
  );
}

function SlotWhen({
  tpl,
  seed,
  busy,
  onCancel,
  onSave,
}: {
  tpl: CheckTemplate;
  seed?: HistorySchedule | null;
  busy?: boolean;
  onCancel: () => void;
  onSave: (row: Omit<HistorySchedule, "id" | "dueAt" | "lastFiredAt" | "lastJobId" | "lastSkip">) => void;
}) {
  const init = draftBits(seed);
  const [kind, setKind] = useState<HistoryWhen["kind"]>(init.kind);
  const [days, setDays] = useState<number[]>(init.days);
  const [every, setEvery] = useState(init.every);
  const [unit, setUnit] = useState<PlanUnit>(init.unit);
  const [nth, setNth] = useState(init.nth);
  const [nthDay, setNthDay] = useState(init.nthDay);
  const [date, setDate] = useState(init.date);
  const [at, setAt] = useState(init.at);
  const fields = checkRunFields(tpl);
  function when(): HistoryWhen {
    if (kind === "weekly") return { kind: "weekly", days };
    if (kind === "interval") return { kind: "interval", every, unit };
    if (kind === "nthWeekday") return { kind: "nthWeekday", n: nth, day: nthDay };
    if (kind === "ymd") return { kind: "ymd", date };
    return { kind: "daily" };
  }
  const canSave = Boolean(at) && (kind !== "weekly" || days.length > 0) && (kind !== "ymd" || Boolean(date));
  return (
    <div className="rounded-[1.25rem] bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
      <p className="font-display text-[1.35rem] leading-none">{tpl.name}</p>
      <p className="mt-2 text-sm">{tpl.meaning}</p>
      <p className="mt-2 text-[0.78rem] text-muted">{whoLine(tpl.audience)} · {stepLine(fields.steps, fields.also)} · {PLAN_FROM_OPTS.find((o) => o.id === tpl.dateFromId)?.label}</p>
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
            <Chip key={d.n} on={days.includes(d.n)} onClick={() => setDays(days.includes(d.n) ? days.filter((x) => x !== d.n) : [...days, d.n].sort((a, b) => a - b))}>{d.t}</Chip>
          ))}
        </div>
      ) : null}
      {kind === "interval" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm">каждые</span>
          <input type="number" min={1} max={36} className="h-9 w-16 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8" value={every} onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))} />
          <select className="h-9 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8" value={unit} onChange={(e) => setUnit(e.target.value as PlanUnit)}>
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
      {kind === "ymd" ? <input type="date" className="mt-2 h-9 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8" value={date} onChange={(e) => setDate(e.target.value)} /> : null}
      <label className="mt-3 block text-sm font-semibold">
        Время · МСК
        <input type="time" step={900} className="mt-1 h-10 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-black/8" value={at} onChange={(e) => setAt(e.target.value)} />
      </label>
      <p className="mt-3 text-[0.75rem] text-muted">Пока общий тумблер выкл — слот лежит и ночью не стартует. Шаги 6 и 7 в номер шага не пишутся.</p>
      <div className="mt-4 flex gap-2">
        <button type="button" className="h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-black/10" onClick={onCancel}>Отмена</button>
        <button
          type="button"
          disabled={busy || !canSave}
          className="h-9 rounded-full bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => {
            onSave({
              on: true,
              mode: "auto",
              when: when(),
              at,
              recheckDays: planFromIdToRecheckDays(tpl.dateFromId),
              dateFromId: tpl.dateFromId,
              study: fields.study,
              label: tpl.name,
              leads: fields.leads,
              archGroups: fields.archGroups,
              steps: fields.steps,
              also: fields.also,
              templateId: tpl.id,
              depth: tpl.depth,
            });
          }}
        >
          Сохранить слот
        </button>
      </div>
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
  onRunCheck,
  people,
  focus,
}: {
  policy: CrmSyncPolicy;
  job?: JobSnap | null;
  busy?: boolean;
  planLog?: PlanLogRow[];
  historyWorker?: { at?: string; silent?: boolean };
  people?: PlanPerson[];
  focus?: PlanPerson | null;
  onSave: (next: CrmSyncPolicy) => void;
  onRunCheck?: (opts: CheckRun) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState("");
  const [screen, setScreen] = useState<"home" | "now" | "tpl" | "plan" | "log">(focus?.cid ? "now" : "home");
  const [menuId, setMenuId] = useState("");
  const [draft, setDraft] = useState<CheckTemplate>(() => (focus?.cid ? { ...blankCheck(), audience: ["one"], cid: focus.cid } : blankCheck()));
  const [draftKey, setDraftKey] = useState(focus?.cid ? "focus" : "new");
  const [slotTpl, setSlotTpl] = useState("");
  const run = Boolean(job?.running) && !job?.stop;
  const head = useMemo(() => {
    if (run) return { k: "Сейчас", t: job?.cur || "Работаем", s: `${job?.n || 0} из ${job?.total || 0}` };
    if (!policy.planEnabled) return { k: "Пауза", t: "Расписание выключено", s: "Слоты лежат и сами не стартуют" };
    const soon = policy.plan
      .filter((r) => r.on)
      .map((r) => ({ r, at: nextSlotAt(r) }))
      .filter((x) => x.at)
      .sort((a, b) => (a.at!.getTime() || 0) - (b.at!.getTime() || 0))[0];
    if (!soon) return { k: "Пусто", t: "Расписаний нет", s: "Ночью ничего не поедет" };
    return {
      k: "Ближайший",
      t: soon.r.label || planModeMeta(soon.r.mode).label,
      s: `${whenLabel(soon.r.when)} · ${fmtSlot(soon.r)}`,
    };
  }, [policy, run, job?.cur, job?.n, job?.total]);
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
      <div className="flex items-center gap-4 rounded-[1.25rem] bg-white px-4 py-4 shadow-sm ring-1 ring-black/[0.04]">
        <Switch on={policy.planEnabled} disabled={busy} onClick={() => patch({ ...policy, planEnabled: !policy.planEnabled })} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted">{head.k}</p>
          <p className="truncate font-display text-[1.2rem] leading-tight">{head.t}</p>
          <p className="truncate text-[0.78rem] text-muted">{head.s}</p>
          {historyWorker?.silent ? <p className="mt-1 text-[0.75rem] text-red-800">Процесс истории молчит — ночные слоты не поедут.</p> : null}
        </div>
        {screen !== "home" ? (
          <button type="button" className="shrink-0 text-[0.78rem] font-medium text-muted hover:text-black" onClick={() => { setScreen("home"); setAdding(false); setEditId(""); setSlotTpl(""); }}>
            Назад
          </button>
        ) : (
          <button type="button" className="shrink-0 text-[0.78rem] font-medium text-muted hover:text-red-700" disabled={busy} onClick={() => {
            if (!window.confirm("Сбросить настройки пульта? Синхронизация расписания выкл, слоты удалятся. Шаблоны остаются. Текущая загрузка не остановится.")) return;
            patch({ planEnabled: false, plan: [], templates: policy.templates || [] });
          }}>
            Сброс
          </button>
        )}
      </div>

      {screen === "home" ? (
        <div className="grid gap-2">
          {(
            [
              ["now", "Сейчас", "Одна проверка: кого, шаги, окно."],
              ["tpl", "Шаблоны", (policy.templates || []).length ? `${(policy.templates || []).filter((t) => t.on).length} вкл` : "Пока нет"],
              ["plan", "Расписание", policy.plan.length ? `${policy.plan.filter((r) => r.on).length} вкл · само, без конца` : "Слотов нет"],
              ["log", "Журнал", "Последние синхронизации и сбои."],
            ] as const
          ).map(([id, title, hint]) => (
            <button key={id} type="button" onClick={() => setScreen(id)} className="group flex items-center justify-between rounded-[1.25rem] bg-white px-4 py-4 text-left shadow-sm ring-1 ring-black/[0.04] transition hover:ring-black/15">
              <span>
                <span className="block font-display text-[1.15rem] leading-tight">{title}</span>
                <span className="mt-1 block text-[0.78rem] text-muted">{hint}</span>
              </span>
              <span className="text-lg text-black/25 transition group-hover:text-black">→</span>
            </button>
          ))}
        </div>
      ) : null}

      {screen === "now" ? (
        <CheckEditor
          key={draftKey}
          busy={busy}
          run={run}
          people={people}
          seedPerson={(people || []).find((p) => p.cid === draft.cid) || (draft.audience.length === 1 && draft.audience[0] === "one" ? focus : null) || null}
          draft={draft}
          onRun={onRunCheck}
          onSaveTemplate={(row) => {
            const templates = policy.templates || [];
            const nowIso = new Date().toISOString();
            if (row.id) {
              const nextTpl = { ...row, updatedAt: nowIso };
              patch({
                ...policy,
                templates: templates.map((t) => (t.id === row.id ? nextTpl : t)),
                plan: applyTemplateToSlots(policy.plan, nextTpl),
              });
            } else {
              const num = nextCheckNum(templates);
              const id = `chk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
              patch({
                ...policy,
                templates: [...templates, { ...row, id, num, createdAt: nowIso, updatedAt: nowIso }],
              });
            }
            setScreen("tpl");
          }}
        />
      ) : null}

      {screen === "tpl" ? (
        <div className="space-y-2">
          {(policy.templates || []).map((t) => (
            <article key={t.id} className="rounded-[1.25rem] bg-white px-4 py-4 shadow-sm ring-1 ring-black/[0.04]">
              <p className="text-[0.72rem] font-medium text-muted">{checkCode(t.num)}{t.on ? "" : " · выкл"}</p>
              <p className="mt-1 font-display text-[1.2rem] leading-tight">{t.name}</p>
              <p className="mt-2 text-sm">{t.meaning}</p>
              <p className="mt-2 text-[0.78rem] text-muted">{whoLine(t.audience)}{t.cid ? ` · №${t.cid}` : ""}</p>
              <p className="mt-1 text-[0.78rem] text-muted">{stepLine(t.steps, t.also) || "шагов нет"} · {PLAN_FROM_OPTS.find((o) => o.id === t.dateFromId)?.label} · {t.depth === "full" ? "только пустые" : "перепроверить"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[0.78rem]">
                <button type="button" className="h-8 rounded-full bg-black px-3 font-medium text-white" onClick={() => {
                  setDraft(t);
                  setDraftKey(`${t.id}-${t.updatedAt}`);
                  setScreen("now");
                }}>Применить</button>
                <button type="button" className="h-8 rounded-full bg-black/[0.04] px-3 font-medium" onClick={() => {
                  const fields = checkRunFields(t);
                  if (fields.one && !t.cid) {
                    window.alert("В ночном слоте некого спросить. Откройте шаблон и укажите номер.");
                    return;
                  }
                  setSlotTpl(t.id);
                  setAdding(false);
                  setEditId("");
                  setScreen("plan");
                }}>В расписание</button>
                <button type="button" className="h-8 rounded-full bg-black/[0.04] px-3 font-medium" onClick={() => {
                  setDraft(t);
                  setDraftKey(`edit-${t.id}-${t.updatedAt}`);
                  setScreen("now");
                }}>Править</button>
                <button type="button" className="h-8 rounded-full bg-black/[0.04] px-3 font-medium" disabled={busy} onClick={() => {
                  patch({ ...policy, templates: (policy.templates || []).map((x) => (x.id === t.id ? { ...x, on: !x.on } : x)) });
                }}>{t.on ? "Выключить" : "Включить"}</button>
                <button type="button" className="h-8 rounded-full px-3 font-medium text-red-700" disabled={busy} onClick={() => {
                  if (!window.confirm(`Удалить ${checkCode(t.num)}? Его слоты расписания тоже удалятся. Остальные останутся.`)) return;
                  patch({
                    ...policy,
                    templates: (policy.templates || []).filter((x) => x.id !== t.id),
                    plan: policy.plan.filter((s) => s.templateId !== t.id),
                  });
                }}>Удалить</button>
              </div>
            </article>
          ))}
          {!(policy.templates || []).length ? <p className="text-sm text-muted">Шаблонов нет. Соберите проверку в «Сейчас» и сохраните.</p> : null}
          <button type="button" className="h-12 w-full rounded-full bg-black text-sm font-medium text-white" onClick={() => {
            setDraft(blankCheck());
            setDraftKey(`new-${Date.now()}`);
            setScreen("now");
          }}>Новая проверка</button>
        </div>
      ) : null}

      {screen === "log" ? (
        <div className="rounded-[1.25rem] bg-white px-4 py-4 shadow-sm ring-1 ring-black/[0.04]">
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
          {slotTpl && slotTpl !== "pick" && (policy.templates || []).find((t) => t.id === slotTpl) ? (
            <SlotWhen
              key={slotTpl + (editing?.id || "new")}
              busy={busy}
              tpl={(policy.templates || []).find((t) => t.id === slotTpl)!}
              seed={editing}
              onCancel={() => { setSlotTpl(""); setAdding(false); setEditId(""); }}
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
                setSlotTpl("");
                setAdding(false);
                setEditId("");
              }}
            />
          ) : slotTpl === "pick" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">Какой шаблон поставить в слот. Один шаблон можно поставить несколько раз.</p>
              {(policy.templates || []).filter((t) => t.on).map((t) => (
                <button key={t.id} type="button" className="block w-full rounded-[1.25rem] bg-white px-4 py-3 text-left shadow-sm ring-1 ring-black/[0.04]" onClick={() => {
                  const fields = checkRunFields(t);
                  if (fields.one && !t.cid) {
                    window.alert("В ночном слоте некого спросить. Укажите номер в шаблоне.");
                    return;
                  }
                  setSlotTpl(t.id);
                }}>
                  <span className="block text-sm font-semibold">{checkCode(t.num)} · {t.name}</span>
                  <span className="mt-1 block text-[0.78rem] text-muted">{t.meaning}</span>
                </button>
              ))}
              {!(policy.templates || []).some((t) => t.on) ? <p className="text-sm text-muted">Нет включённых шаблонов.</p> : null}
              <button type="button" className="h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-black/10" onClick={() => setSlotTpl("")}>Отмена</button>
            </div>
          ) : formOpen ? (
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
              <ul className="space-y-2">
                {policy.plan.map((r) => (
                  <li key={r.id} className="rounded-[1.25rem] bg-white px-4 py-4 shadow-sm ring-1 ring-black/[0.04]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-[2rem] leading-none tracking-tight">{r.at}</p>
                        <p className="mt-2 truncate text-sm font-medium">{r.label || planModeMeta(r.mode).label}</p>
                        <p className="mt-0.5 text-[0.78rem] text-muted">
                          {r.when.kind === "ymd" ? `${whenLabel(r.when)} · один раз` : `${whenLabel(r.when)} · без конца`}
                          {r.study === "2" ? " · архив" : ""}
                        </p>
                        <p className="mt-2 text-[0.75rem] text-black/70">
                          Ближайший {fmtSlot(r)}
                          {r.lastSkip === "hands" ? " · руки заняли" : ""}
                          {r.lastSkip === "expired" ? " · слот сгорел" : ""}
                        </p>
                      </div>
                      <Switch on={r.on} disabled={busy} onClick={() => patch({ ...policy, plan: policy.plan.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)) })} />
                    </div>
                    <div className="mt-3 flex gap-4 text-[0.78rem]">
                      <button type="button" className="font-medium underline decoration-black/20 underline-offset-4 hover:decoration-black" disabled={busy} onClick={() => {
                        setMenuId("");
                        setAdding(false);
                        if (r.templateId && (policy.templates || []).some((t) => t.id === r.templateId)) {
                          setSlotTpl(r.templateId);
                          setEditId(r.id);
                        } else {
                          setSlotTpl("");
                          setEditId(r.id);
                        }
                      }}>
                        Править
                      </button>
                      <button type="button" className="font-medium text-muted hover:text-black" onClick={() => setMenuId(menuId === r.id ? "" : r.id)}>
                        {menuId === r.id ? "Скрыть" : "Ещё"}
                      </button>
                    </div>
                    {menuId === r.id ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="h-8 rounded-full bg-black/[0.04] px-3 text-[0.78rem]" disabled={busy} onClick={() => move(r.id, -1)}>Выше</button>
                        <button type="button" className="h-8 rounded-full bg-black/[0.04] px-3 text-[0.78rem]" disabled={busy} onClick={() => move(r.id, 1)}>Ниже</button>
                        <button type="button" className="h-8 rounded-full bg-black/[0.04] px-3 text-[0.78rem]" disabled={busy} onClick={() => {
                          const id = `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                          patch({
                            ...policy,
                            plan: [...policy.plan, { ...r, id, label: r.label ? `${r.label} · копия` : "копия", dueAt: "", lastFiredAt: "", lastJobId: "", lastSkip: "" }],
                          });
                          setMenuId("");
                        }}>Копия</button>
                        <button type="button" className="h-8 rounded-full px-3 text-[0.78rem] text-red-700" disabled={busy} onClick={() => {
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
              <button type="button" className="h-12 w-full rounded-full bg-black text-sm font-medium text-white" onClick={() => { setEditId(""); setAdding(false); setSlotTpl("pick"); }}>
                Добавить расписание
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
  onRunCheck,
  people,
  focus,
  planLog,
  historyWorker,
}: {
  open: boolean;
  onClose: () => void;
  policy: CrmSyncPolicy;
  job?: JobSnap | null;
  busy?: boolean;
  onSave: (next: CrmSyncPolicy) => void;
  onRunCheck?: (opts: CheckRun) => void;
  people?: PlanPerson[];
  focus?: PlanPerson | null;
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
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/35 p-3 backdrop-blur-[2px] sm:items-center" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-plan-title"
        className="max-h-[min(92vh,56rem)] w-full max-w-lg overflow-y-auto rounded-[1.6rem] bg-[#f4f3f1] p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 px-1">
          <p id="history-plan-title" className="font-display text-[1.45rem] leading-none">
            Пульт
          </p>
          <button
            type="button"
            className="h-8 rounded-full px-3 text-[0.78rem] text-muted hover:bg-black/5 hover:text-black"
            onClick={onClose}
            aria-label="Закрыть"
          >
            Закрыть
          </button>
        </div>
        <HistoryPlanPanel policy={policy} job={job} busy={busy} planLog={planLog} historyWorker={historyWorker} people={people} focus={focus} onSave={onSave} onRunCheck={onRunCheck} />
      </div>
    </div>
  );
}
