"use client";

import { Component, type ComponentType, type ReactNode, lazy, useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { isChunkLoadError } from "@/data/http-error";

function isAdminPath() {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
}

function reloadSoon(ms = 2800) {
  if (typeof window === "undefined") return;
  window.setTimeout(() => window.location.reload(), ms);
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const raw = String(error?.message || "");
  const chunk = isChunkLoadError(raw);
  const crash = /unhandled|502|500|Bad Gateway|out of memory|ENOMEM/i.test(raw);
  const admin = isAdminPath();
  useEffect(() => {
    if (chunk || crash) reloadSoon(chunk ? 1200 : 2800);
  }, [chunk, crash]);
  const title = chunk || crash ? "Система обновляется" : "Не получилось открыть страницу";
  const text = chunk || crash
    ? admin
      ? "Новая версия кабинета загружается. Страница откроется сама."
      : "Сайт обновляется. Страница откроется сама через несколько секунд."
    : "Попробуйте обновить страницу. Если снова ошибка — подождите полминуты и повторите.";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f4f7fb] px-6 text-center text-fg">
      <div className="w-full max-w-[22rem] rounded-[8px] bg-white px-8 py-9 shadow-[0_12px_32px_rgba(15,23,42,0.18)] ring-1 ring-black/10">
        <div className="mx-auto grid size-[4.6rem] place-items-center">
          <span className="relative block size-[4.6rem]">
            <span className="absolute inset-0 rounded-full bg-sky-50 ring-1 ring-sky-100" />
            <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-sky-100 border-t-sky-600" />
            <span className="absolute inset-[18px] animate-pulse rounded-full bg-gradient-to-br from-sky-500 to-sky-700" />
          </span>
        </div>
        <h1 className="mt-5 font-display text-[1.35rem] leading-tight">{title}</h1>
        <p className="mt-2 text-[0.9rem] leading-snug text-muted">{text}</p>
        <button
          type="button"
          className="mt-5 text-[0.8rem] font-semibold text-muted underline-offset-2 hover:text-fg hover:underline"
          onClick={() => window.location.reload()}
        >
          Обновить сейчас
        </button>
      </div>
    </main>
  );
}

export function lazyWithRetry(load: () => Promise<{ default: ComponentType<any> }>) {
  return lazy(() =>
    load().catch((err: unknown) => {
      if (isChunkLoadError(err)) {
        reloadSoon(400);
        return new Promise<{ default: ComponentType<any> }>(() => {});
      }
      throw err;
    }),
  );
}

export class TabError extends Component<{ children: ReactNode; quiet?: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    if (isChunkLoadError(err)) reloadSoon(400);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="mt-8 rounded-3xl bg-surface px-5 py-6 shadow-[var(--shadow-border)]">
        <p className="font-display text-xl">Система обновляется</p>
        <p className="mt-2 max-w-lg text-sm text-muted">Новая версия раздела загружается. Страница откроется сама.</p>
        <button
          type="button"
          className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg"
          onClick={() => window.location.reload()}
        >
          Обновить сейчас
        </button>
      </div>
    );
  }
}
