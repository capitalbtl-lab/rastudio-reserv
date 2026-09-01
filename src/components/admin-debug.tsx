"use client";

import { useEffect, useState } from "react";
import { adminDebugMode, DEBUG_TOOLS } from "@/data/debug-mode";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export function AdminDebug() {
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await adminDebugMode({ data: { token: token(), action: "get" } });
    if (res.ok && "tools" in res) setTools(res.tools);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setBusy(true);
    const res = await adminDebugMode({ data: { token: token(), action: "save", tools } });
    setBusy(false);
    setMsg(res.ok ? "Сохранено. Кто вошёл в отладку паролем, увидит только включённые инструменты." : res.error || "Ошибка");
  }

  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl">Режим отладки</h2>
          <InfoTip text="Кнопка в подвале сайта. Пароль — как у кабинета. Обычный родитель панель не видит. Здесь включаете, какие датчики показывать вошедшему." />
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Внизу сайта — «Режим отладки». После пароля администратора на странице появляются только отмеченные инструменты.
        </p>
      </div>
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
      <div className="flex justify-end">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Сохранить набор
        </Button>
      </div>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
    </section>
  );
}
