"use client";

import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const raw = String(error?.message || "");
  const crash = /unhandled|502|500|Bad Gateway|out of memory|ENOMEM/i.test(raw);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-primary" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl">{crash ? "Кабинет перезапускается" : "Не получилось открыть страницу"}</h1>
      <p className="max-w-md text-sm text-muted">
        {crash
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
