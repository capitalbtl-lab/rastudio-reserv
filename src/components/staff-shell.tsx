"use client";

import type { ReactNode } from "react";
import { useAdminLiveReload } from "@/components/admin-reload-btn";

/** Кабинет без шапки сайта, виджета Ольги и отладки. Родительский бандл сюда не входит. */
export function StaffShell({ children }: { children: ReactNode }) {
  const live = useAdminLiveReload();
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="flex h-12 items-center justify-between border-b border-black/10 px-4 text-sm">
        <span className="font-semibold">Кабинет</span>
        <div className="flex items-center gap-3">
          {live ? <span className="text-[0.78rem] text-primary">{live}</span> : null}
          <a href="/" className="text-muted hover:text-fg">
            На сайт
          </a>
        </div>
      </div>
      {children}
    </div>
  );
}
