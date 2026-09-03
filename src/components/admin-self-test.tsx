"use client";

import { forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import { adminSelfTest, type CheckResult } from "@/data/admin-selftest";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function tidyError(raw: string) {
  const s = String(raw || "");
  if (/<!DOCTYPE|<html|502 Bad Gateway|504 Gateway|nginx/i.test(s)) {
    return "Сервер не ответил (перезапуск). Обновите страницу и нажмите «Проверить» ещё раз.";
  }
  if (/node:fs|readFileSync|externalized for browser/i.test(s)) {
    return "Серверная проверка попала в браузер. Обновите страницу — это уже починено.";
  }
  return s.slice(0, 400);
}

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export const adminGhostBtn =
  "inline-flex h-8 shrink-0 items-center rounded-lg bg-black/[0.07] px-3 text-[0.72rem] font-semibold text-muted hover:bg-black/[0.12] disabled:opacity-50";

export type AdminSelfTestHandle = { run: () => void };

export const AdminSelfTest = forwardRef<AdminSelfTestHandle, {
  section: string;
  label?: string;
  heading?: ReactNode;
  extra?: ReactNode;
  tip?: string;
  hideTrigger?: boolean;
}>(function AdminSelfTest({
  section,
  label = "Проверить раздел",
  heading,
  extra,
  tip,
  hideTrigger,
}, ref) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");
  const [pass, setPass] = useState(0);
  const [fail, setFail] = useState(0);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [grok, setGrok] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [dry, setDry] = useState(true);
  const [leftovers, setLeftovers] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  async function run() {
    setBusy(true);
    setError("");
    setOpen(true);
    setCopied(false);
    setLeftovers([]);
    setErrors([]);
    setChecks([]);
    setGrok("");
    const res = await adminSelfTest({ data: { token: token(), section } }).catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : "Не удалось проверить",
    }));
    setBusy(false);
    if (!res.ok) {
      setError(tidyError(res.error || "Не удалось проверить"));
      return;
    }
    setTitle(res.title);
    setHint(res.hint);
    setPass(res.pass);
    setFail(res.fail);
    setChecks(res.checks);
    setGrok(res.grok || "");
    setDry(res.dry !== false);
    setLeftovers(Array.isArray(res.leftovers) ? res.leftovers.filter(Boolean) : []);
    setErrors(Array.isArray(res.errors) ? res.errors.filter(Boolean) : []);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(grok);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  useImperativeHandle(ref, () => ({ run: () => { void run(); } }));

  return (
    <div className="w-full">
      {hideTrigger ? null : (
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">{heading}</div>
        <div className="flex shrink-0 items-center gap-2 pb-1">
          <button type="button" disabled={busy} onClick={() => void run()} className={adminGhostBtn}>
            {busy ? "Проверяю…" : label}
          </button>
          {extra}
          <InfoTip
            text={
              tip ||
              "Сухой прогон: файлы, ключи API и связи с другими разделами. CRM и сайт не меняются. Сбой — простым языком плюс сырой ответ. Кнопка «Скопировать для Grok» собирает весь отчёт."
            }
          />
        </div>
      </div>
      )}
      {open ? (
        <div className="mt-4 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
          {error ? <p className="text-sm text-primary">{error}</p> : null}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {title}
                <span className="ml-2 font-normal text-muted">
                  ок {pass}
                  {fail ? ` · сбоев ${fail}` : ""} · {checks.length} проверок
                  {busy ? " · идёт проверка" : dry ? " · без записи" : " · запись в CRM, без удаления"}
                </span>
              </p>
              {hint ? <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">{hint}</p> : null}
            </div>
            {grok ? (
              <button type="button" onClick={() => void copy()} className={adminGhostBtn}>
                {copied ? "Скопировано" : "Скопировать для Grok"}
              </button>
            ) : null}
          </div>
          {errors.length ? (
            <div className="mt-4 rounded-xl bg-[#e11d48]/10 px-3 py-3 text-sm ring-1 ring-[#e11d48]/20">
              <p className="font-semibold text-[#e11d48]">Ошибки для оператора</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {errors.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {leftovers.length ? (
            <div className="mt-3 rounded-xl bg-amber-100 px-3 py-3 text-sm ring-1 ring-amber-300/60">
              <p className="font-semibold text-amber-900">Удалите в AlfaCRM сами</p>
              <p className="mt-1 text-[0.78rem] text-amber-900/80">
                Проверка записала тестовые данные и специально ничего не стирает — даже то, что сама создала.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-950">
                {leftovers.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="mt-4 space-y-3">
            {checks.map((c) => (
              <li key={c.id} className="rounded-xl bg-surface-2 px-3 py-2.5">
                <p className="text-[0.82rem] leading-snug">
                  <span className={cn("mr-1.5 font-semibold", c.ok ? (c.skip ? "text-muted" : "text-emerald-700") : "text-primary")}>
                    {c.ok ? (c.skip ? "пропуск" : "ок") : "сбой"}
                  </span>
                  <span className="font-medium">{c.title}</span>
                  <span className="ml-2 text-[0.65rem] text-muted">{c.id} · {c.ms}мс</span>
                </p>
                <p className="mt-1 text-[0.8rem] leading-relaxed">{c.plain || c.detail}</p>
                {!c.ok && c.fix ? <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">Как чинить: {c.fix}</p> : null}
                {c.related?.length ? <p className="mt-1 text-[0.72rem] text-muted">Связано: {c.related.join(" · ")}</p> : null}
                {c.raw ? (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white px-2 py-1.5 text-[0.7rem] leading-snug text-fg ring-1 ring-black/8">
                    {c.raw}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
          {grok ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-[0.72rem] font-semibold text-muted">Текст отчёта целиком</summary>
              <textarea readOnly value={grok} rows={12} className="mt-2 w-full rounded-xl bg-surface-2 px-3 py-2 text-[0.72rem] leading-relaxed ring-1 ring-black/10" />
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

export function AdminSectionHead({
  section,
  title,
  tip,
  children,
  aside,
  extra,
  check = true,
}: {
  section: string;
  title: string;
  tip?: string;
  children?: ReactNode;
  aside?: ReactNode;
  extra?: ReactNode;
  check?: boolean;
}) {
  const head = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-3xl">{title}</h2>
          {tip ? <InfoTip text={tip} /> : null}
        </div>
        {children}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {extra}
        {aside}
      </div>
    </div>
  );
  if (!check) return head;
  return <AdminSelfTest section={section} heading={head} />;
}