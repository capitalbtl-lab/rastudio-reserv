"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const RA_ADMIN_RELOAD = "ra-admin-reload";

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

export function requestAdminReload() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RA_ADMIN_RELOAD));
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
