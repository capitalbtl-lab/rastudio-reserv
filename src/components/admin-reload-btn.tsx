"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { RA_POP } from "@/data/admin-ui";

export const RA_ADMIN_RELOAD = "ra-admin-reload";

export type AdminLivePhase = "" | "deploying" | "waiting" | "reload";

export function requestAdminReload() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RA_ADMIN_RELOAD));
}

/** Подписка раздела: обновить свои данные без F5. */
export function useAdminReload(fn: () => void | Promise<void>) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = () => void ref.current();
    window.addEventListener(RA_ADMIN_RELOAD, on);
    return () => window.removeEventListener(RA_ADMIN_RELOAD, on);
  }, []);
}

function typingNow() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(el.isContentEditable);
}

/** Кабинет сам перезагружается, когда на сервере встаёт новая сборка. */
export function useAdminLiveReload() {
  const [phase, setPhase] = useState<AdminLivePhase>("");
  useEffect(() => {
    let seen = "";
    let idle = false;
    let busy = false;
    let timer = 0;
    let started = 0;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(`/api/build?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { sha?: string; deploying?: boolean };
        const sha = String(j.sha || "");
        const deploying = Boolean(j.deploying);
        if (!seen) {
          seen = sha;
          idle = !deploying;
          setPhase("");
          return;
        }
        if (deploying && idle) {
          if (!started) started = Date.now();
          if (Date.now() - started > 70 * 1000) {
            idle = false;
            setPhase("");
            return;
          }
          setPhase("deploying");
          return;
        }
        if (sha && sha !== seen) {
          if (typingNow()) {
            setPhase("waiting");
            return;
          }
          setPhase("reload");
          window.setTimeout(() => window.location.reload(), 1600);
          return;
        }
        if (!deploying) {
          idle = true;
          started = 0;
          setPhase((p) => (p === "reload" ? p : ""));
        }
      } catch {
        if (started && Date.now() - started > 70 * 1000) {
          idle = false;
          setPhase("");
        }
      } finally {
        busy = false;
      }
    };
    void tick();
    timer = window.setInterval(() => void tick(), 8000);
    const vis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  return phase;
}

export function AdminUpdateOverlay({ phase }: { phase: AdminLivePhase }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
  }, [phase]);
  if (hidden || (phase !== "deploying" && phase !== "reload")) return null;
  const node = (
    <div className="fixed inset-0 z-[420] flex items-center justify-center bg-[#0b1c2c]/55 p-4 backdrop-blur-[6px]" data-op="admin-updating" role="status" aria-live="polite">
      <div className={cn(RA_POP, "relative w-full max-w-[22rem] overflow-hidden px-8 py-9 text-center")}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden bg-sky-100">
          <span className="absolute inset-y-0 w-1/3 animate-[ra-bar_1.2s_ease-in-out_infinite] rounded-full bg-sky-500" />
        </div>
        <div className="mx-auto grid size-[4.6rem] place-items-center">
          <span className="relative block size-[4.6rem]">
            <span className="absolute inset-0 rounded-full bg-sky-50 ring-1 ring-sky-100" />
            <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-sky-100 border-t-sky-600" />
            <span className="absolute inset-[9px] rounded-full border-[3px] border-transparent border-b-sky-400" style={{ animation: "spin 1.35s linear infinite reverse" }} />
            <span className="absolute inset-[18px] animate-pulse rounded-full bg-gradient-to-br from-sky-500 to-sky-700" />
          </span>
        </div>
        <h2 className="mt-5 font-display text-[1.35rem] leading-tight text-fg">Система обновляется</h2>
        <p className="mt-2 text-[0.9rem] leading-snug text-muted">
          {phase === "reload" ? "Подключаю новую версию кабинета…" : "Новая версия выкладывается. Кабинет откроется сам."}
        </p>
        <button
          type="button"
          className="mt-5 text-[0.8rem] font-semibold text-muted underline-offset-2 hover:text-fg hover:underline"
          onClick={() => setHidden(true)}
        >
          Работать дальше
        </button>
      </div>
      <style>{`@keyframes ra-bar{0%{left:-40%}100%{left:110%}}`}</style>
    </div>
  );
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

export function AdminReloadBtn({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-op="reload-admin"
      title="Обновить кабинет без перезагрузки страницы"
      aria-label="Обновить кабинет"
      disabled={busy}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-black/[0.07] text-muted hover:bg-black/[0.12] disabled:opacity-50",
        className,
      )}
      onClick={() => {
        setBusy(true);
        requestAdminReload();
        window.setTimeout(() => setBusy(false), 1400);
      }}
    >
      <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} aria-hidden />
    </button>
  );
}
