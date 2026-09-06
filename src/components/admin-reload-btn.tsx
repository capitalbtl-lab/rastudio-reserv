"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const RA_ADMIN_RELOAD = "ra-admin-reload";

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
  const [note, setNote] = useState("");
  useEffect(() => {
    let seen = "";
    let timer = 0;
    const tick = async () => {
      try {
        const res = await fetch(`/api/build?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { sha?: string; deploying?: boolean };
        const sha = String(j.sha || "");
        if (j.deploying && seen) {
          setNote("Выкладываю новую версию…");
          return;
        }
        if (!sha) return;
        if (!seen) {
          seen = sha;
          setNote("");
          return;
        }
        if (sha === seen) {
          if (!j.deploying) setNote("");
          return;
        }
        if (typingNow()) {
          setNote("Новая версия готова — обновлю кабинет, когда закончите ввод.");
          return;
        }
        setNote("Новая версия — обновляю кабинет…");
        window.setTimeout(() => window.location.reload(), 900);
      } catch {
        /* сервер в момент перезапуска */
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
  return note;
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
