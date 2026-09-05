"use client";

import { useEffect, useMemo, useState } from "react";
import { adminDebugMode } from "@/data/debug-fn";
import { DEBUG_TOOLS } from "@/data/debug-client";
import { adminAgentBrain, SITE_WINDOW_FLAGS, type AgentSettings } from "@/data/agent-config";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { AdminSaveBar } from "@/components/admin-save-bar";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function ago(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s} с назад`;
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
  return new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type LastHit = { at: string; ok: boolean; ms: number; channel: string; error?: string; chars?: number };

export function AdminDebug() {
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [widget, setWidget] = useState<Record<string, boolean>>({});
  const [site, setSite] = useState<AgentSettings | null>(null);
  const [last, setLast] = useState<LastHit[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [dbg, win] = await Promise.all([
      adminDebugMode({ data: { token: token(), action: "get" } }),
      adminAgentBrain({ data: { token: token(), action: "getSettings" } }),
    ]);
    if (dbg.ok && "tools" in dbg) setTools(dbg.tools);
    if (dbg.ok && "widget" in dbg) setWidget(dbg.widget || {});
    if (dbg.ok && "last" in dbg && Array.isArray((dbg as { last?: LastHit[] }).last)) {
      setLast((dbg as { last: LastHit[] }).last);
    }
    if (win.ok && "settings" in win) setSite(win.settings);
    if (!dbg.ok) setMsg(dbg.error || "Не удалось загрузить отладку.");
  }

  useEffect(() => {
    void load();
  }, []);

  const hidden = useMemo(
    () => SITE_WINDOW_FLAGS.filter((f) => site && site[f.id] === false),
    [site],
  );

  async function save() {
    setBusy(true);
    const res = await adminDebugMode({ data: { token: token(), action: "save", tools, widget } });
    setBusy(false);
    if (res.ok && "tools" in res) {
      setTools(res.tools);
      setWidget(res.widget || {});
      if ("last" in res && Array.isArray((res as { last?: LastHit[] }).last)) setLast((res as { last: LastHit[] }).last);
    }
    setMsg(res.ok ? "Сохранено. Панель на сайте — после входа в отладку в подвале." : res.error || "Ошибка");
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="max-w-2xl text-sm text-muted">
          Датчики и последние ответы модели. Окно чата — вкладка «Окно». Чипы — «Кнопки». Здесь их нет.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Последние ответы модели</p>
        {!last.length ? (
          <p className="rounded-3xl bg-surface px-5 py-6 text-sm text-muted shadow-[var(--shadow-border)]">
            Пока пусто. После реплики Олега или Ольги здесь появится время и ошибка, без текста переписки.
          </p>
        ) : (
          <ul className="space-y-2">
            {last.map((h, i) => (
              <li key={`${h.at}-${i}`} className="rounded-3xl bg-surface px-5 py-3 text-sm shadow-[var(--shadow-border)]">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", h.ok && !h.error ? "bg-primary/10 text-primary" : "bg-amber-50 text-amber-900")}>
                    {h.ok && !h.error ? "ок" : "сбой"}
                  </span>
                  <span className="tabular-nums text-muted">{h.ms} мс</span>
                  <span className="text-muted">{h.channel}</span>
                  {h.chars ? <span className="text-muted">{h.chars} знак.</span> : null}
                  <span className="ml-auto text-[0.72rem] text-muted">{ago(h.at)}</span>
                </p>
                {h.error ? <p className="mt-1 text-muted">{h.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          Датчики панели на сайте
          <InfoTip text="Кнопка в подвале rastudio.org. Пароль — как у кабинета. Родитель панель не видит." />
        </p>
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
        <p className="mb-2 text-sm font-semibold">Скрыто на сайте — показать себе</p>
        {!site ? (
          <p className="text-sm text-muted">Читаю окно…</p>
        ) : !hidden.length ? (
          <p className="rounded-3xl bg-surface px-5 py-6 text-sm text-muted shadow-[var(--shadow-border)]">
            На сайте сейчас всё из «Окно» и «Кнопки» включено. Здесь нечего дублировать. Чтобы спрятать у родителей и оставить себе — выключите там, затем включите здесь.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {hidden.map((t) => {
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
                    <span className="font-semibold">{t.title}</span>
                    <span className="mt-1 block text-muted">На сайте выключено. В отладке {on ? "видно вам" : "тоже скрыто"}.</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <AdminSaveBar>
        {msg ? <p className="text-sm text-primary">{msg}</p> : null}
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Сохранить отладку
        </Button>
      </AdminSaveBar>
    </div>
  );
}
