"use client";

import { useEffect, useState } from "react";
import { adminAgentBrain, type AgentSettings } from "@/data/agent-config";
import { Button } from "@/components/ui/button";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export function AdminAgent() {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await adminAgentBrain({ data: { token: token(), action: "get" } });
    if (res.ok && "settings" in res) setSettings(res.settings);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    const res = await adminAgentBrain({ data: { token: token(), action: "saveSettings", settings } });
    setBusy(false);
    setMsg(res.ok ? "Сохранено — ассистент уже работает с этими правилами." : res.error || "Ошибка");
  }

  if (!settings) return <p className="mt-10 text-sm text-muted">Загрузка настроек…</p>;

  return (
    <section className="mt-10 space-y-6">
      <div>
        <h2 className="font-display text-3xl">Ассистент ИИ</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Как Олег и Ольга ведут диалог на сайте. Возраст, филиал и курс запоминаются до сброса круглой кнопкой в чате.
        </p>
      </div>

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
            <option value="warm">Тёплый, живой</option>
            <option value="short">Короткий</option>
            <option value="detailed">Подробнее</option>
          </select>
        </label>
      </div>

      <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={settings.askOnce}
            onChange={(e) => setSettings({ ...settings, askOnce: e.target.checked })}
            className="mt-1"
          />
          <span>
            <strong>Не повторять вопросы.</strong> Если возраст, город, филиал, курс, имя или телефон уже названы — не спрашивать снова.
          </span>
        </label>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={settings.injectTraining}
            onChange={(e) => setSettings({ ...settings, injectTraining: e.target.checked })}
            className="mt-1"
          />
          <span>
            Подмешивать примеры из раздела «Обучение» в каждый ответ ассистента.
          </span>
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

      <label className="block rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)] md:p-6">
        Дополнительная инструкция (всегда в промпте)
        <textarea
          value={settings.extra}
          onChange={(e) => setSettings({ ...settings, extra: e.target.value })}
          rows={6}
          placeholder="Например: не предлагай летние программы с сентября; на Гражданской нет беспилотников."
          className="mt-2 w-full rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-black/10"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Сохранить настройки
        </Button>
        {msg ? <p className="text-sm text-primary">{msg}</p> : null}
      </div>
    </section>
  );
}
