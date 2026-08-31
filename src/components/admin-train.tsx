"use client";

import { useEffect, useState } from "react";
import { adminAgentBrain, type TrainExample, type ScriptSection } from "@/data/agent-config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/info-tip";
import { AdminTrainDocs } from "@/components/admin-train-docs";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const KIND: Record<TrainExample["kind"], string> = {
  qa: "Вопрос → ответ",
  rule: "Правило",
  dialog: "Диалог с сайта",
  correction: "Исправление",
};

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminTrain() {
  const [pane, setPane] = useState<"scripts" | "docs" | "examples">("scripts");
  const [rows, setRows] = useState<TrainExample[]>([]);
  const [scripts, setScripts] = useState<ScriptSection[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<TrainExample["kind"]>("qa");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSys, setLastSys] = useState("");

  async function load() {
    const res = await adminAgentBrain({ data: { token: token(), action: "get" } });
    if (res.ok && "examples" in res) {
      setRows(res.examples);
      if ("scripts" in res && res.scripts) {
        setScripts(res.scripts);
        const d: Record<string, string> = {};
        for (const s of res.scripts) d[s.id] = s.body;
        setDraft(d);
      }
      if ("lastSystematized" in res) setLastSys(String(res.lastSystematized || ""));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setBusy(true);
    const res = await adminAgentBrain({
      data: { token: token(), action: "add", example: { kind, input, output, note, source: "manual" } },
    });
    setBusy(false);
    if (!res.ok) setMsg(res.error || "Ошибка");
    else {
      setInput("");
      setOutput("");
      setNote("");
      setMsg("Пример записан в обучение.");
      if ("examples" in res) setRows(res.examples);
    }
  }

  async function remove(id: string) {
    const res = await adminAgentBrain({ data: { token: token(), action: "remove", example: { id } } });
    if (res.ok && "examples" in res) setRows(res.examples);
  }

  async function saveScript(id: string) {
    setBusy(true);
    const res = await adminAgentBrain({
      data: { token: token(), action: "saveScript", script: { id, body: draft[id] || "" } },
    });
    setBusy(false);
    if (res.ok && "scripts" in res && res.scripts) {
      setScripts(res.scripts);
      setMsg("Скрипт сохранён — ассистент уже идёт по нему.");
    } else setMsg(res.ok ? "" : res.error || "Ошибка");
  }

  async function resetScripts() {
    if (!window.confirm("Вернуть эталон воронки? Правки скриптов сотрутся.")) return;
    setBusy(true);
    const res = await adminAgentBrain({ data: { token: token(), action: "resetScripts" } });
    setBusy(false);
    if (res.ok && "scripts" in res && res.scripts) {
      setScripts(res.scripts);
      const d: Record<string, string> = {};
      for (const s of res.scripts) d[s.id] = s.body;
      setDraft(d);
      setMsg("Эталон воронки восстановлен.");
    }
  }

  async function systematize() {
    setBusy(true);
    const res = await adminAgentBrain({ data: { token: token(), action: "systematize" } });
    setBusy(false);
    if (res.ok) {
      if ("scripts" in res && res.scripts) {
        setScripts(res.scripts);
        const d: Record<string, string> = {};
        for (const s of res.scripts) d[s.id] = s.body;
        setDraft(d);
      }
      if ("examples" in res) setRows(res.examples);
      if ("lastSystematized" in res) setLastSys(String(res.lastSystematized || ""));
      setMsg(("note" in res && res.note ? String(res.note) : "Готово") + (`added` in res && res.added ? ` · +${res.added} примеров` : ""));
    } else setMsg(res.error || "Ошибка");
  }

  function exportJson() {
    const payload = {
      studio: "Развивайся",
      exportedAt: new Date().toISOString(),
      format: "rastudio-agent-training.v1",
      scripts,
      examples: rows,
    };
    download(`rastudio-agent-training-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  function exportJsonl() {
    const lines = rows
      .filter((e) => e.kind !== "rule")
      .map((e) =>
        JSON.stringify({
          messages: [
            { role: "system", content: "Администратор студии «Развивайся». Воронка: возраст → город → филиал → направление → программа → запись." },
            { role: "user", content: e.input },
            { role: "assistant", content: e.output },
          ],
        }),
      );
    download(
      `rastudio-agent-training-${new Date().toISOString().slice(0, 10)}.jsonl`,
      lines.join("\n"),
      "application/jsonl",
    );
  }

  async function onImport(file: File) {
    const text = await file.text();
    let examples: TrainExample[] = [];
    try {
      if (file.name.endsWith(".jsonl")) {
        examples = text
          .split("\n")
          .map((ln) => ln.trim())
          .filter(Boolean)
          .map((ln) => {
            const j = JSON.parse(ln) as { messages?: { role: string; content: string }[] };
            const user = j.messages?.find((m) => m.role === "user")?.content || "";
            const asst = j.messages?.find((m) => m.role === "assistant")?.content || "";
            return { id: "", at: "", kind: "qa" as const, input: user, output: asst, note: "", source: "import" };
          });
      } else {
        const j = JSON.parse(text) as { examples?: TrainExample[] } | TrainExample[];
        examples = Array.isArray(j) ? j : j.examples || [];
      }
    } catch {
      setMsg("Файл не разобрался. Нужен JSON или JSONL.");
      return;
    }
    setBusy(true);
    const res = await adminAgentBrain({ data: { token: token(), action: "import", examples } });
    setBusy(false);
    if (res.ok && "examples" in res) {
      setRows(res.examples);
      setMsg(`Импортировано: ${"added" in res ? res.added : examples.length}`);
    } else setMsg(res.ok ? "" : res.error || "Ошибка импорта");
  }

  return (
    <section className="mt-10 space-y-6">
      <div>
        <h2 className="font-display text-3xl">Обучение ассистента</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Скрипты — как вести разговор. Документы — оферта, правила, методички. Примеры — живые реплики. Ассистент берёт это в ответы, пока запись включена.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPane("scripts")}
          className={cn("rounded-full px-4 py-2 text-sm font-semibold", pane === "scripts" ? "bg-primary text-primary-foreground" : "bg-surface")}
        >
          Скрипты воронки
        </button>
        <button
          type="button"
          onClick={() => setPane("docs")}
          className={cn("rounded-full px-4 py-2 text-sm font-semibold", pane === "docs" ? "bg-primary text-primary-foreground" : "bg-surface")}
        >
          Документы
        </button>
        <button
          type="button"
          onClick={() => setPane("examples")}
          className={cn("rounded-full px-4 py-2 text-sm font-semibold", pane === "examples" ? "bg-primary text-primary-foreground" : "bg-surface")}
        >
          Примеры
        </button>
      </div>

      {pane === "docs" ? <AdminTrainDocs /> : null}

      {pane === "scripts" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void systematize()}>
              Систематизировать по диалогам
            </Button>
            <InfoTip text="Берёт последние диалоги сайта, считает, где родители застревают, и дописывает блок «наблюдения». Воронку не ломает. Запускайте раз в неделю." />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void resetScripts()}>
              Вернуть эталон
            </Button>
            <InfoTip text="Стирает правки шагов возраст / город / филиал / направление и возвращает заводской скрипт. Документы и примеры не трогает." />
            {lastSys ? <p className="self-center text-xs text-muted">Последний раз: {when(lastSys)}</p> : null}
          </div>
          {msg ? <p className="text-sm text-primary">{msg}</p> : null}
          {scripts.map((s) => (
            <article key={s.id} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-xl">{s.title}</p>
                    <InfoTip text="Текст этого шага попадает в системный промпт, пока слот не закрыт. Пишите коротко, одним вопросом. Не просите спрашивать возраст и город — это делают кнопки." />
                  </div>
                  <p className="text-xs text-muted">
                    {s.step}
                    {s.auto ? " · из диалогов" : ""}
                    {s.updatedAt ? ` · ${when(s.updatedAt)}` : ""}
                  </p>
                </div>
                <Button type="button" disabled={busy} onClick={() => void saveScript(s.id)}>
                  Сохранить
                </Button>
              </div>
              <textarea
                value={draft[s.id] ?? s.body}
                onChange={(e) => setDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                rows={s.id === "funnel" ? 12 : 7}
                className="mt-3 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm leading-relaxed ring-1 ring-black/10"
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={exportJson} disabled={!rows.length && !scripts.length}>
              Экспорт JSON
            </Button>
            <InfoTip text="Скачивает скрипты и примеры одним файлом. Удобно сохранить копию или перенести на другого агента." />
            <Button type="button" variant="secondary" onClick={exportJsonl} disabled={!rows.length}>
              Экспорт JSONL
            </Button>
            <InfoTip text="Формат для дообучения модели: каждая строка — диалог system / user / assistant. Правила (kind=rule) сюда не входят." />
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold shadow-[var(--shadow-border)]">
              Импорт JSON / JSONL
              <InfoTip text="Добавляет примеры из файла. Дубликаты (тот же вопрос и ответ) пропускаются. Скрипты из файла не перезаписываются." />
              <input
                type="file"
                accept=".json,.jsonl,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImport(f);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="self-center text-sm text-muted">{rows.length} записей</p>
          </div>

          <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <p className="text-sm font-semibold">
              Новая запись <InfoTip text="Ручной пример. Вопрос родителя и эталонный ответ. Тип «правило» — запрет или установка без реплики. Заметка в модель не уходит." />
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                Тип
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as TrainExample["kind"])}
                  className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                >
                  <option value="qa">Вопрос → ответ</option>
                  <option value="rule">Правило</option>
                  <option value="correction">Исправление</option>
                  <option value="dialog">Диалог</option>
                </select>
              </label>
              <label className="text-sm">
                Заметка (не уходит в модель)
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              {kind === "rule" ? "Правило" : "Реплика родителя"}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-black/10"
              />
            </label>
            {kind === "rule" ? null : (
              <label className="mt-3 block text-sm">
                Как должен ответить ассистент
                <textarea
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-black/10"
                />
              </label>
            )}
            <Button className="mt-4" type="button" disabled={busy || (!input.trim() && !output.trim())} onClick={() => void add()}>
              Записать в обучение
            </Button>
            {msg && pane === "examples" ? <p className="mt-2 text-sm text-primary">{msg}</p> : null}
          </div>

          <div className="space-y-3">
            {rows.map((e) => (
              <article key={e.id} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">
                    {when(e.at)} · {KIND[e.kind]} · {e.source}
                  </p>
                  <button type="button" className="text-xs font-semibold text-primary" onClick={() => void remove(e.id)}>
                    Удалить
                  </button>
                </div>
                {e.note ? <p className="mt-1 text-xs text-muted">{e.note}</p> : null}
                <p className="mt-2 text-sm">
                  <span className="text-muted">{e.kind === "rule" ? "Правило: " : "Родитель: "}</span>
                  {e.input || "—"}
                </p>
                {e.kind === "rule" ? null : (
                  <p className="mt-1 text-sm">
                    <span className="text-muted">Ассистент: </span>
                    {e.output || "—"}
                  </p>
                )}
              </article>
            ))}
            {rows.length ? null : <p className="text-sm text-muted">Пока пусто — добавьте правило или пример ответа.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
