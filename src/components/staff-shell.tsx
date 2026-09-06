"use client";

import type { ReactNode } from "react";

/** Кабинет без шапки сайта, виджета Ольги и отладки. Родительский бандл сюда не входит. */
export function StaffShell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-bg text-fg">{children}</div>;
}
