"use client";

import { Component, type ComponentType, type ReactNode, lazy, useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { isChunkLoadError } from "@/data/http-error";

function reloadOnce() {
  if (typeof window === "undefined") return false;
  const key = "ra_chunk_reload";
  const last = Number(sessionStorage.getItem(key) || "0");
  if (Date.now() - last < 15000) return false;
  sessionStorage.setItem(key, String(Date.now()));
  window.location.reload();
  return true;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const raw = String(error?.message || "");
  const chunk = isChunkLoadError(raw);
  const crash = /unhandled|502|500|Bad Gateway|out of memory|ENOMEM/i.test(raw);
  useEffect(() => {
    if (chunk) reloadOnce();
  }, [chunk]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-primary" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl">
        {chunk ? "Кабинет обновился" : crash ? "Кабинет перезапускается" : "Не получилось открыть страницу"}
      </h1>
      <p className="max-w-md text-sm text-muted">
        {chunk
          ? "Загрузилась новая версия раздела. Нажмите «Обновить» — кабинет откроется."
          : crash
            ? "Сервер обрабатывал тяжёлый запрос (импорт из Alfa). Обновите страницу — вход и режим отладки снова откроются."
            : "Попробуйте обновить страницу. Если снова ошибка — подождите полминуты и повторите."}
      </p>
      <button
        type="button"
        className="mt-2 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg"
        onClick={() => window.location.reload()}
      >
        Обновить
      </button>
    </main>
  );
}

export function lazyWithRetry(load: () => Promise<{ default: ComponentType<any> }>) {
  return lazy(() =>
    load().catch((err: unknown) => {
      if (isChunkLoadError(err) && reloadOnce()) return new Promise<{ default: ComponentType<any> }>(() => {});
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
    if (isChunkLoadError(err)) reloadOnce();
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="mt-8 rounded-3xl bg-surface px-5 py-6 shadow-[var(--shadow-border)]">
        <p className="font-display text-xl">Раздел не открылся</p>
        <p className="mt-2 max-w-lg text-sm text-muted">Кабинет обновился на сервере. Другие вкладки на месте. Нажмите «Обновить».</p>
        <button
          type="button"
          className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg"
          onClick={() => window.location.reload()}
        >
          Обновить
        </button>
      </div>
    );
  }
}