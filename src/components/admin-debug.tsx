"use client";

import { useEffect, useState } from "react";
import { adminDebugMode, DEBUG_TOOLS } from "@/data/debug-mode";
import { WINDOW_FLAGS } from "@/data/agent-config";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export function AdminDebug() {
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [widget, setWidget] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await adminDebugMode({ data: { token: token(), action: "get" } });
    if (res.ok && "tools" in res) setTools(res.tools);
    if (res.ok && "widget" in res) setWidget(res.widget || {});
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setBusy(true);
    const res = await adminDebugMode({ data: { token: token(), action: "save", tools, widget } });
    setBusy(false);
    setMsg(res.ok ? "Сохранено. На сайте функции из «Окно и кнопки» скрыты. Здесь включённые видны только после входа в отладку." : res.error || "Ошибка");
  }

  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl">Режим отладки</h2>
          <InfoTip text="Кнопка в подвале сайта. Пароль — как у кабинета. Обычный родитель панель и скрытые кнопки чата не видит." />
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Если в «Окно и кнопки» функцию выключили — на сайте её нет. Включите её здесь, и она появится только у того, кто вошёл в режим отладки.
        </p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Датчики панели</p>
        <div className="grid gap-3 md:grid-cols-2">
          {DEBUG_TOOLS.map((t) => (
            <label key={t.id} className="flex items-start gap-3 rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
              <input
                type="checkbox"
                checked={tools[t.id] !== false}
                onChange={(e) => setTools((prev) => ({ ...prev, [t.id]: e.target.checked }))}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">{t.label}</span>
                <span className="mt-1 block text-muted">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Окно и кнопки — только в отладке</p>
        <div className="grid gap-3 md:grid-cols-2">
          {WINDOW_FLAGS.map((t) => {
            const on = widget[t.id] === true;
            return (
              <label key={t.id} className="flex items-start gap-3 rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setWidget((prev) => ({ ...prev, [t.id]: e.target.checked }))}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold">
                    {t.title}
                    <InfoTip text={t.tip} />
                  </span>
                  <span className="mt-1 block text-muted">{t.hint}</span>
                  <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", on ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted")}>
                    {on ? "в отладке включено" : "в отладке выключено"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Сохранить набор
        </Button>
      </div>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
    </section>
  );
}
