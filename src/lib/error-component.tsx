"use client";

import { Component, type ComponentType, type ReactNode, lazy } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { isChunkLoadError } from "@/data/http-error";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const raw = String(error?.message || "");
  const chunk = isChunkLoadError(raw);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f4f7fb] px-6 text-center text-fg">
      <div className="w-full max-w-[22rem] rounded-[8px] bg-white px-8 py-9 shadow-[0_12px_32px_rgba(15,23,42,0.18)] ring-1 ring-black/10">
        <h1 className="font-display text-[1.35rem] leading-tight">{chunk ? "Страница устарела" : "Не получилось открыть страницу"}</h1>
        <p className="mt-2 text-[0.9rem] leading-snug text-muted">
          {chunk ? "Обновите страницу — загрузится текущая версия." : "Попробуйте обновить страницу. Если снова ошибка — подождите полминуты."}
        </p>
        <button
          type="button"
          className="mt-5 text-[0.8rem] font-semibold text-muted underline-offset-2 hover:text-fg hover:underline"
          onClick={() => window.location.reload()}
        >
          Обновить
        </button>
      </div>
    </main>
  );
}

export function lazyWithRetry(load: () => Promise<{ default: ComponentType<any> }>) {
  return lazy(() => load());
}

export class TabError extends Component<{ children: ReactNode; quiet?: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="mt-8 rounded-3xl bg-surface px-5 py-6 shadow-[var(--shadow-border)]">
        <p className="font-display text-xl">Раздел не открылся</p>
        <p className="mt-2 max-w-lg text-sm text-muted">Обновите страницу.</p>
        <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => window.location.reload()}>
          Обновить
        </button>
      </div>
    );
  }
}
