"use client";

import { useEffect, useState } from "react";
import { debugSession, unlockDebug, debugSessionChanged, type DebugToolId } from "@/data/debug-mode";
import { slotsFromMessages } from "@/data/funnel-state";
import { Button } from "@/components/ui/button";

const KEY = "ra_debug";

function token() {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function DebugDock() {
  const [ask, setAsk] = useState(false);
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [on, setOn] = useState(false);
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(true);
  const [chat, setChat] = useState<{ role: string; content: string }[]>([]);
  const [voice, setVoice] = useState<Record<string, unknown>>({});
  const [net, setNet] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const t = token();
    if (!t) return;
    void debugSession({ data: { token: t } }).then((res) => {
      if (res.ok && "tools" in res) {
        setOn(true);
        setTools(res.tools);
      }
    });
  }, []);

  useEffect(() => {
    const onEv = (e: Event) => {
      const d = (e as CustomEvent).detail as { kind?: string; payload?: unknown };
      if (d.kind === "chat" && Array.isArray(d.payload)) setChat(d.payload as { role: string; content: string }[]);
      if (d.kind === "voice" && d.payload && typeof d.payload === "object") setVoice(d.payload as Record<string, unknown>);
      if (d.kind === "net" && d.payload && typeof d.payload === "object") setNet(d.payload as Record<string, unknown>);
    };
    const onOpen = () => setAsk(true);
    window.addEventListener("ra-debug", onEv);
    window.addEventListener("ra-debug-open", onOpen);
    return () => {
      window.removeEventListener("ra-debug", onEv);
      window.removeEventListener("ra-debug-open", onOpen);
    };
  }, []);

  async function enter() {
    setErr("");
    const res = await unlockDebug({ data: { password: pass } });
    if (!res.ok) {
      setErr(res.error || "Нет");
      return;
    }
    try {
      sessionStorage.setItem(KEY, res.token);
    } catch {
      /* */
    }
    setTools(res.tools || {});
    setOn(true);
    setAsk(false);
    setPass("");
    debugSessionChanged();
  }

  function leave() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* */
    }
    setOn(false);
    setTools({});
    debugSessionChanged();
  }

  const slots = slotsFromMessages(chat);
  const show = (id: DebugToolId) => tools[id] !== false;

  return (
    <>
      {ask && !on ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4">
          <form
            className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]"
            onSubmit={(e) => {
              e.preventDefault();
              void enter();
            }}
          >
            <p className="font-display text-xl">Режим отладки</p>
            <p className="mt-1 text-sm text-muted">Пароль — тот же, что у кабинета администратора. Клиенты эту панель не видят.</p>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="mt-4 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
              placeholder="Пароль"
              autoFocus
            />
            {err ? <p className="mt-2 text-sm text-primary">{err}</p> : null}
            <div className="mt-4 flex gap-2">
              <Button type="submit">Войти</Button>
              <Button type="button" variant="secondary" onClick={() => setAsk(false)}>
                Отмена
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {on ? (
        <div className="fixed bottom-24 left-3 z-[70] w-[min(22rem,calc(100vw-1.5rem))] md:bottom-4">
          <div className="rounded-2xl bg-header/95 p-3 text-[0.75rem] text-header-fg shadow-[0_16px_40px_-16px_rgba(0,0,0,.5)] backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">Отладка</p>
              <div className="flex gap-2">
                <button type="button" className="underline" onClick={() => setOpen((v) => !v)}>
                  {open ? "свернуть" : "открыть"}
                </button>
                <button type="button" className="underline" onClick={leave}>
                  выйти
                </button>
              </div>
            </div>
            {open ? (
              <div className="mt-2 max-h-[50vh] space-y-2 overflow-auto">
                {show("funnel") ? (
                  <p>
                    Возраст: {slots.age || "—"} · Город: {slots.city || "—"} · Филиал: {slots.branch || "—"}
                  </p>
                ) : null}
                {show("voice") ? (
                  <p>
                    Голос: {voice.voiceOn ? "вкл" : "выкл"} · говорит: {voice.speaking ? "да" : "нет"} · слушает: {voice.listening ? "да" : "нет"}
                    {voice.error ? ` · ${String(voice.error)}` : ""}
                  </p>
                ) : null}
                {show("net") ? (
                  <p>
                    Сеть: {net.ok === false ? "ошибка" : "ок"} {net.ms ? `· ${String(net.ms)} мс` : ""} {net.error ? `· ${String(net.error)}` : ""}
                  </p>
                ) : null}
                {show("chat") ? (
                  <ol className="space-y-1 border-t border-white/15 pt-2">
                    {chat.map((m, i) => (
                      <li key={i}>
                        <span className="opacity-60">{m.role === "user" ? "К" : "А"}:</span> {m.content.slice(0, 180)}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function openDebugAsk() {
  window.dispatchEvent(new Event("ra-debug-open"));
}
