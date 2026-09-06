"use client";

import type { ReactNode } from "react";

/** Кабинет без шапки сайта, виджета Ольги и отладки. Родительский бандл сюда не входит. */
export function StaffShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="flex h-12 items-center justify-between border-b border-black/10 px-4 text-sm">
        <span className="font-semibold">Кабинет</span>
        <a href="/" className="text-muted hover:text-fg">
          На сайт
        </a>
      </div>
      {children}
    </div>
  );
}
