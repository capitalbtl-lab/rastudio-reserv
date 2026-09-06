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
  return lazy(() =>
    load().catch((err) => {
      if (typeof window !== "undefined" && isChunkLoadError(err)) {
        const key = "ra_chunk_reload";
        const last = Number(sessionStorage.getItem(key) || 0);
        if (Date.now() - last > 12_000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      }
      throw err;
    }),
  );
}

export class TabError extends Component<{ children: ReactNode; quiet?: boolean }, { failed: boolean; chunk: boolean; message: string }> {
  state = { failed: false, chunk: false, message: "" };
  static getDerivedStateFromError(error: Error) {
    const message = String(error?.message || error || "");
    return { failed: true, chunk: isChunkLoadError(message), message };
  }
  componentDidCatch(error: Error) {
    if (isChunkLoadError(error) && typeof window !== "undefined") {
      const key = "ra_chunk_reload";
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 12_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.setTimeout(() => window.location.reload(), 250);
      }
    }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="mt-8 rounded-3xl bg-surface px-5 py-6 shadow-[var(--shadow-border)]">
        <p className="font-display text-xl">{this.state.chunk ? "Кабинет обновляется" : "Раздел не открылся"}</p>
        <p className="mt-2 max-w-lg text-sm text-muted">
          {this.state.chunk ? "Секунда — загружается текущая версия." : "Обновите страницу. Если снова ошибка — подождите полминуты."}
        </p>
        {this.state.message && !this.state.chunk ? (
          <p className="mt-2 max-w-2xl break-words font-mono text-[0.72rem] text-muted/80">{this.state.message.slice(0, 280)}</p>
        ) : null}
        <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => window.location.reload()}>
          Обновить
        </button>
      </div>
    );
  }
}
