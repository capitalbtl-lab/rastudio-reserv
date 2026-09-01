"use client";

import { useEffect, useState } from "react";
import { adminAgentBrain, type AgentSettings, WINDOW_FLAGS } from "@/data/agent-config";
import { Button } from "@/components/ui/button";
import { AdminChats } from "@/components/admin-chats";
import { AdminVoices } from "@/components/admin-voices";
import { AdminVoiceEdits } from "@/components/admin-voice-edits";
import { AdminTrain } from "@/components/admin-train";
import { AdminAccess } from "@/components/admin-access";
import { AdminDebug } from "@/components/admin-debug";
import { AdminSectionHead } from "@/components/admin-self-test";
import { AdminSaveBar } from "@/components/admin-save-bar";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

type Pane = "window" | "dialog" | "voices" | "edits" | "chats" | "train" | "access" | "debug";

const PANES: { id: Pane; label: string }[] = [
  { id: "window", label: "Окно и кнопки" },
  { id: "train", label: "Обучение агентов" },
  { id: "dialog", label: "Как говорит" },
  { id: "voices", label: "Голоса" },
  { id: "edits", label: "Изменение сайта" },
  { id: "chats", label: "Диалоги сайта" },
  { id: "access", label: "Голосовой доступ" },
  { id: "debug", label: "Отладка" },
];

function Toggle({
  on,
  title,
  hint,
  tip,
  set,
}: {
  on: boolean;
  title: string;
  hint: string;
  tip: string;
  set: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-1" />
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-semibold">
          {title}
          <InfoTip text={tip} />
        </span>
        <span className="mt-1 block text-muted">{hint}</span>
        <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", on ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted")}>
          {on ? "включено" : "выключено"}
        </span>
      </span>
    </label>
  );
}

export function AdminAgent() {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<Pane>("train");

  async function load() {
    const res = await adminAgentBrain({ data: { token: token(), action: "get" } });
    if (res.ok && "settings" in res) setSettings(res.settings);
    else setMsg(res.ok ? "" : res.error || "Не удалось загрузить настройки окна. Обучение агентов всё равно можно открыть.");
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    const res = await adminAgentBrain({ data: { token: token(), action: "saveSettings", settings } });
    setBusy(false);
    setMsg(res.ok ? "Сохранено — на сайте сразу, после обновления страницы." : res.error || "Ошибка");
  }

  if (!settings && pane !== "train" && pane !== "voices" && pane !== "edits" && pane !== "chats" && pane !== "access" && pane !== "debug") {
    return (
      <section className="mt-10 space-y-6">
        <AdminSectionHead section="agent" title="Ассистент ИИ">
          <p className="mt-2 max-w-2xl text-sm text-muted">Окно чата, обучение агентов, голоса и история диалогов.</p>
        </AdminSectionHead>
        <div className="flex flex-wrap gap-2">
          {PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPane(p.id)}
              className={cn("rounded-full px-4 py-2 text-sm font-semibold", pane === p.id ? "bg-primary text-primary-foreground" : "bg-surface")}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">{msg || "Загрузка настроек окна… Нажмите «Обучение агентов», если нужно сразу к скриптам и документам."}</p>
      </section>
    );
  }

  return (
    <section className="mt-10 space-y-6">
      <AdminSectionHead
        section={pane === "window" ? "agent-window" : pane === "dialog" ? "agent-dialog" : `agent-${pane}`}
        title="Ассистент ИИ"
      >
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Окно чата, обучение агентов, голоса, доступ и история диалогов — всё здесь.
        </p>
      </AdminSectionHead>

      <div className="flex flex-wrap gap-2">
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPane(p.id)}
            className={cn("rounded-full px-4 py-2 text-sm font-semibold", pane === p.id ? "bg-primary text-primary-foreground" : "bg-surface")}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pane === "window" && settings ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {WINDOW_FLAGS.map((f) => (
              <Toggle
                key={f.id}
                on={Boolean(settings[f.id])}
                set={(v) => setSettings({ ...settings, [f.id]: v })}
                title={f.title}
                hint={f.hint}
                tip={f.tip}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {msg ? <p className="text-sm text-primary">{msg}</p> : null}
            <Button type="button" disabled={busy} onClick={() => void save()}>
              Сохранить
            </Button>
          </div>
        </div>
      ) : null}

      {pane === "dialog" && settings ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
              Кто встречает родителя
              <select
                value={settings.defaultPartner}
                onChange={(e) => setSettings({ ...settings, defaultPartner: e.target.value === "oleg" ? "oleg" : "olga" })}
                className="mt-2 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
              >
                <option value="olga">Ольга</option>
                <option value="oleg">Олег</option>
              </select>
            </label>
            <label className="rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
              Стиль ответов
              <select
                value={settings.style}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    style: e.target.value === "short" || e.target.value === "detailed" ? e.target.value : "warm",
                  })
                }
                className="mt-2 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
              >
                <option value="warm">Как Алиса: коротко, один вопрос</option>
                <option value="short">Ещё короче</option>
                <option value="detailed">Чуть подробнее, всё равно один вопрос</option>
              </select>
            </label>
          </div>
          <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={settings.askOnce} onChange={(e) => setSettings({ ...settings, askOnce: e.target.checked })} className="mt-1" />
              <span>
                <strong>Не повторять вопросы.</strong> Если возраст, город, филиал, курс, имя или телефон уже названы — не спрашивать снова.
              </span>
            </label>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" checked={settings.injectTraining} onChange={(e) => setSettings({ ...settings, injectTraining: e.target.checked })} className="mt-1" />
              <span>Подмешивать примеры из раздела «Обучение» в каждый ответ ассистента.</span>
            </label>
            <label className="mt-4 block text-sm">
              Сколько примеров обучения держать в голове
              <input
                type="number"
                min={4}
                max={80}
                value={settings.maxExamples}
                onChange={(e) => setSettings({ ...settings, maxExamples: Number(e.target.value) || 40 })}
                className="mt-2 h-11 w-32 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
              />
            </label>
          </div>
          <label className="flex flex-col rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)] md:p-6">
            Дополнительная инструкция (всегда в промпте)
            <textarea
              value={settings.extra}
              onChange={(e) => setSettings({ ...settings, extra: e.target.value })}
              rows={6}
              placeholder="Например: не предлагай летние программы с сентября; на Гражданской нет беспилотников."
              className="mt-2 w-full rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-black/10"
            />
            <AdminSaveBar>
              <Button type="button" disabled={busy} onClick={() => void save()}>
                Сохранить настройки
              </Button>
            </AdminSaveBar>
          </label>
          {msg ? <p className="text-right text-sm text-primary">{msg}</p> : null}
        </div>
      ) : null}

      {pane === "voices" ? <AdminVoices /> : null}
      {pane === "edits" ? <AdminVoiceEdits /> : null}
      {pane === "chats" ? <AdminChats /> : null}
      {pane === "train" ? <AdminTrain /> : null}
      {pane === "access" ? <AdminAccess /> : null}
      {pane === "debug" ? <AdminDebug /> : null}
    </section>
  );
}
