"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { cn } from "@/lib/utils";
import {
  ACTION_RU,
  RESULT_RU,
  STEP_RU,
  changeLine,
  settingsLine,
  whoOf,
  type StepLogFlip,
  type StepLogNamedBucket,
  type StepLogResult,
  type StepLogRow,
  type StepLogRun,
  type StepN,
} from "@/data/crm-step-run-log-core";

type RunMeta = {
  id: string;
  jobId?: string;
  step: StepN;
  at: string;
  endedAt?: string;
  note?: string;
  settings?: StepLogRun["settings"];
  summary?: StepLogRun["summary"];
  n?: number;
};

type Props = {
  step: 0 | StepN;
  tick?: string;
  compact?: boolean;
};

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function whenRu(at?: string) {
  if (!at) return "";
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return at;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function resultTone(r: StepLogResult, matched?: boolean) {
  if (matched === true || r === "ok" || r === "right") return "text-emerald-800";
  if (r === "fail") return "text-red-800";
  if (r === "skip" || r === "more" || r === "empty") return "text-muted";
  return "text-amber-800";
}

async function call(payload: Record<string, unknown>) {
  return adminSchedule({
    data: { token: token(), action: "stepLog", ...payload } as never,
  }) as Promise<Record<string, unknown>>;
}

function download(name: string, text: string, csv = false) {
  const blob = new Blob([text], { type: csv ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Chip({ on, children, onClick }: { on?: boolean; children: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-[0.78rem] font-semibold ring-1",
        on ? "bg-black text-white ring-black" : "bg-white ring-black/10 hover:bg-black/5",
      )}
    >
      {children}
    </button>
  );
}

export function StepRunLogPanel({ step, tick, compact }: Props) {
  const [open, setOpen] = useState(true);
  const [namesOpen, setNamesOpen] = useState(false);
  const [purgeDays, setPurgeDays] = useState(7);
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [runId, setRunId] = useState("");
  const [otherId, setOtherId] = useState("");
  const [run, setRun] = useState<StepLogRun | null>(null);
  const [allRows, setAllRows] = useState<StepLogRow[]>([]);
  const [named, setNamed] = useState<StepLogNamedBucket[]>([]);
  const [flips, setFlips] = useState<StepLogFlip[]>([]);
  const [filter, setFilter] = useState<"all" | "right" | "left" | "hole" | "extra" | "fail">("all");
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState("");
  const [editNote, setEditNote] = useState("");
  const [runNote, setRunNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    const res = await call({ kind: step ? "list" : "all", step });
    if (res.ok === false) return;
    const list = (res.runs as RunMeta[]) || [];
    setRuns(list);
    if (step === 0) {
      setAllRows((res.rows as StepLogRow[]) || []);
      setNamed((res.named as StepLogNamedBucket[]) || []);
    }
    setRunId((cur) => {
      if (cur && list.some((r) => r.id === cur)) return cur;
      return list[0]?.id || "";
    });
  }, [step]);

  const loadRun = useCallback(
    async (id: string) => {
      if (!id || step === 0) return;
      const res = await call({ kind: "get", runId: id });
      if (res.ok === false) return;
      const next = res.run as StepLogRun;
      setRun(next);
      setNamed((res.named as StepLogNamedBucket[]) || []);
      setRunNote(next.note || "");
    },
    [step],
  );

  useEffect(() => {
    if (!open) return;
    void loadList();
  }, [open, loadList, tick]);

  useEffect(() => {
    if (!open || !runId || step === 0) return;
    void loadRun(runId);
  }, [open, runId, loadRun, step, tick]);

  useEffect(() => {
    if (!open || !runId || !otherId || runId === otherId) {
      setFlips([]);
      return;
    }
    void call({ kind: "compare", runId, otherId }).then((res) => {
      if (res.ok) setFlips((res.flips as StepLogFlip[]) || []);
    });
  }, [open, runId, otherId]);

  const rows = step === 0 ? allRows : run?.rows || [];
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "right" && !(r.matched === true || r.result === "ok" || r.result === "right")) return false;
      if (filter === "left" && !(r.matched === false || r.result === "left" || r.result === "mismatch")) return false;
      if (filter === "hole" && r.result !== "hole") return false;
      if (filter === "extra" && r.result !== "extra") return false;
      if (filter === "fail" && r.result !== "fail") return false;
      if (!qq) return true;
      return whoOf(r).toLowerCase().includes(qq) || String(r.cid || "").includes(qq) || (r.note || "").toLowerCase().includes(qq);
    });
  }, [rows, filter, q]);

  const summary = step === 0 ? undefined : run?.summary;
  const title = step ? STEP_RU[step] : "Вся обработка";

  async function copyNow() {
    const res = await call({ kind: "export", format: "txt", runId: step ? runId : "", step });
    const text = String(res.text || "");
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Скопировано.");
    } catch {
      setMsg("Не удалось скопировать — скачайте файл.");
    }
  }

  async function saveNote(row: StepLogRow) {
    setBusy(true);
    try {
      const res = await call({ kind: "patch", runId: row.runId, rowId: row.id, note: editNote });
      if (res.ok) {
        setEditId("");
        if (step) await loadRun(runId);
        else await loadList();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/8">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display text-[1.05rem]">{step ? `Лог · ${title}` : title}</p>
        <button
          type="button"
          className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold ring-1 ring-black/10", open ? "bg-black text-white ring-black" : "bg-white")}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Свернуть" : "Открыть"}
        </button>
        {summary ? (
          <p className="text-[0.78rem] text-muted">
            {summary.unique} чел. · совпало {summary.right || summary.ok} · не совпало {summary.left || summary.mismatch}
            {summary.hole ? ` · дырка ${summary.hole}` : ""}
            {summary.extra ? ` · лишние ${summary.extra}` : ""}
            {summary.fail ? ` · сбой ${summary.fail}` : ""}
          </p>
        ) : null}
      </div>
      {!compact ? (
        <p className="mt-1 text-[0.75rem] text-muted">
          Только снимает. Шаг не меняет. Имена — кто как обработан. Сравните два прогона с разными окнами, чтобы увидеть прыжки карточек.
        </p>
      ) : (
        <p className="mt-1 text-[0.75rem] text-muted">Снимает результат шага. Сравните прогоны — увидите, кто прыгнул.</p>
      )}
      {!open ? null : (
        <>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
            {step ? (
              <select
                className="h-8 max-w-full min-w-[12rem] rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10"
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                aria-label="Прогон"
              >
                {!runs.length ? <option value="">Прогонов ещё нет</option> : null}
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {whenRu(r.at)} · {settingsLine(r.settings) || "без окна"} · {r.summary?.unique ?? r.n ?? 0}
                  </option>
                ))}
              </select>
            ) : null}
            {step && runs.length > 1 ? (
              <select
                className="h-8 max-w-full min-w-[10rem] rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10"
                value={otherId}
                onChange={(e) => setOtherId(e.target.value)}
                aria-label="Сравнить с"
              >
                <option value="">сравнить с…</option>
                {runs
                  .filter((r) => r.id !== runId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {whenRu(r.at)} · {settingsLine(r.settings) || "без окна"}
                    </option>
                  ))}
              </select>
            ) : null}
            <input
              className="h-8 min-w-[8rem] flex-1 rounded-full bg-white px-3 text-[0.78rem] ring-1 ring-black/10"
              placeholder="ФИО или №"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="button" className="h-8 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10" onClick={() => void copyNow()}>
              Копировать
            </button>
            <button
              type="button"
              className="h-8 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10"
              onClick={() =>
                void call({ kind: "export", format: "txt", runId: step ? runId : "" }).then((res) => {
                  if (res.text) download(String(res.filename || "log.txt"), String(res.text));
                })
              }
            >
              Скачать
            </button>
            <button
              type="button"
              className="h-8 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10"
              onClick={() =>
                void call({ kind: "export", format: "csv", runId: step ? runId : "" }).then((res) => {
                  if (res.text) download(String(res.filename || "log.csv"), String(res.text), true);
                })
              }
            >
              CSV
            </button>
            {step && runId ? (
              <>
                <button
                  type="button"
                  className="h-8 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10"
                  disabled={busy || Boolean(run?.endedAt)}
                  onClick={() =>
                    void call({ kind: "close", runId }).then(() => {
                      setMsg("Прогон закрыт. Следующая проверка начнёт новый.");
                      void loadList();
                    })
                  }
                >
                  Закрыть прогон
                </button>
                <button
                  type="button"
                  className="h-8 rounded-full bg-white px-3 text-[0.78rem] font-semibold text-red-800 ring-1 ring-black/10"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Удалить этот прогон из лога? Шаги и диск не трогаем.")) return;
                    void call({ kind: "deleteRun", runId }).then(() => {
                      setRun(null);
                      setRunId("");
                      void loadList();
                    });
                  }}
                >
                  Удалить прогон
                </button>
              </>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["all", "right", "left", "hole", "extra", "fail"] as const).map((id) => (
              <Chip key={id} on={filter === id} onClick={() => setFilter(id)}>
                {id === "all" ? "все" : id === "right" ? "совпало" : id === "left" ? "не совпало" : id === "hole" ? "дырка" : id === "extra" ? "лишние" : "сбой"}
              </Chip>
            ))}
          </div>
          {msg ? <p className="mt-2 text-[0.78rem] text-muted">{msg}</p> : null}
          {step && run ? (
            <label className="mt-3 block text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted">
              Заметка к прогону
              <span className="mt-1 flex gap-2">
                <input
                  className="h-8 flex-1 rounded-full bg-white px-3 text-[0.78rem] font-medium ring-1 ring-black/8"
                  value={runNote}
                  onChange={(e) => setRunNote(e.target.value)}
                  placeholder="Например: окно 7 дней, после правки кассы"
                />
                <button
                  type="button"
                  className="h-8 rounded-full bg-black px-3 text-[0.78rem] font-semibold text-white"
                  disabled={busy}
                  onClick={() => void call({ kind: "patch", runId, note: runNote }).then(() => setMsg("Заметка сохранена."))}
                >
                  Сохранить
                </button>
              </span>
            </label>
          ) : null}
          {flips.length ? (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
              <p className="text-[0.78rem] font-semibold text-amber-950">Прыжки относительно другого прогона · {flips.length}</p>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-[0.78rem]">
                {flips.map((f) => (
                  <li key={f.key}>
                    {f.name}
                    {f.cid ? ` №${f.cid}` : ""}: {RESULT_RU[f.a]} → {RESULT_RU[f.b]}
                  </li>
                ))}
              </ul>
            </div>
          ) : otherId ? (
            <p className="mt-2 text-[0.78rem] text-muted">Прыжков нет: у одних и тех же людей результат не сменился.</p>
          ) : null}
          {named.length ? (
            <div className="mt-3">
              <button
                type="button"
                className="h-8 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10"
                onClick={() => setNamesOpen((v) => !v)}
              >
                {namesOpen ? "Скрыть сводку" : `Сводка · ${named.reduce((n, b) => n + b.names.length, 0)}`}
              </button>
              {namesOpen ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {named.map((b) => (
                    <section key={b.result} className="rounded-xl bg-surface-2 px-3 py-2">
                      <p className={cn("text-[0.78rem] font-semibold", resultTone(b.result))}>
                        {b.label} · {b.names.length}
                      </p>
                      <ul className="mt-1 max-h-36 space-y-0.5 overflow-y-auto text-[0.75rem] leading-snug">
                        {b.names.map((n) => (
                          <li key={`${n.who}-${n.cid || n.groupId || ""}`}>
                            <span className="font-medium">{n.who}</span>
                            {n.detail ? <span className="text-muted"> · {n.detail}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-[0.78rem] text-muted">Пока пусто. Запустите шаг — сюда попадут ФИО и результат, шаг сам не меняется.</p>
          )}
          <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
            {shown.map((r) => {
              const m = r.matched;
              return (
                <li key={`${r.runId}-${r.id}`} className="rounded-xl bg-surface-2 px-3 py-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 text-[0.78rem] leading-snug">
                      <span className="font-semibold">{whenRu(r.at)}</span>
                      {step === 0 ? <span className="text-muted"> · шаг {r.step}</span> : null}
                      <span> · {whoOf(r)}</span>
                      <span className="text-muted"> · {ACTION_RU[r.action]}</span>
                      <span className={cn("font-semibold", resultTone(r.result, m))}> → {RESULT_RU[r.result]}</span>
                      {m === true ? <span className="text-emerald-800"> · совпало</span> : m === false ? <span className="text-amber-800"> · не совпало</span> : null}
                      {changeLine(r) ? <span className="block text-muted">{changeLine(r)}</span> : null}
                      {r.note ? <span className="block">{r.note}</span> : null}
                      {r.error ? <span className="block text-red-800">{r.error}</span> : null}
                    </p>
                    <button
                      type="button"
                      className="h-8 rounded-full bg-white px-3 text-[0.72rem] font-semibold ring-1 ring-black/10"
                      onClick={() => {
                        setEditId(r.id);
                        setEditNote(r.note || "");
                      }}
                    >
                      Правка
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-full bg-white px-3 text-[0.72rem] font-semibold text-red-800 ring-1 ring-black/10"
                      onClick={() => {
                        if (!window.confirm(`Убрать из лога «${whoOf(r)}»? Диск и Alfa не трогаем.`)) return;
                        void call({ kind: "deleteRow", runId: r.runId, rowId: r.id }).then(() => {
                          if (step) void loadRun(runId);
                          else void loadList();
                        });
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                  {editId === r.id ? (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <textarea
                        className="min-h-16 flex-1 rounded-xl bg-white px-3 py-2 text-[0.78rem] ring-1 ring-black/10"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                      />
                      <button type="button" className="h-8 rounded-full bg-black px-3 text-[0.78rem] font-semibold text-white" disabled={busy} onClick={() => void saveNote(r)}>
                        Записать
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {rows.length && !shown.length ? <p className="mt-2 text-[0.78rem] text-muted">По этому фильтру никого.</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
            <span className="text-[0.75rem] text-muted">Старые прогоны</span>
            <select
              className="h-8 rounded-full bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10"
              value={purgeDays}
              onChange={(e) => setPurgeDays(Number(e.target.value) || 7)}
              aria-label="Удалять логи старше"
            >
              <option value={7}>старше недели</option>
              <option value={14}>старше 2 недель</option>
              <option value={30}>старше месяца</option>
            </select>
            <button
              type="button"
              className="h-8 rounded-full px-3 text-[0.78rem] font-semibold text-red-800 ring-1 ring-red-200"
              disabled={busy}
              onClick={() => {
                const label = purgeDays === 7 ? "недели" : purgeDays === 14 ? "2 недель" : "месяца";
                if (!window.confirm(`Удалить прогоны старше ${label}? Шаги, касса и карточки не трогаются.`)) return;
                setBusy(true);
                void call({ kind: "purge", days: purgeDays })
                  .then((res) => {
                    const n = Number(res.removed) || 0;
                    setMsg(n ? `Удалено прогонов: ${n}.` : "Таких старых прогонов нет.");
                    setRun(null);
                    setRunId("");
                    void loadList();
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Удалить старые
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function StepRunLogModal({ open, onClose, tick, step = 0 }: { open: boolean; onClose: () => void; tick?: string; step?: 0 | StepN }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const title = step ? STEP_RU[step] : "Лог всей обработки";
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/35 p-3 backdrop-blur-[2px] sm:items-center" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-run-log-title"
        className="max-h-[min(92vh,56rem)] w-full max-w-3xl overflow-y-auto rounded-[1.4rem] bg-[#f4f3f1] p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <p id="step-run-log-title" className="font-display text-[1.35rem] leading-none">
            {title}
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
        <StepRunLogPanel step={step} tick={tick} compact />
      </div>
    </div>
  );
}
