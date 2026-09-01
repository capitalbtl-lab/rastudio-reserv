"use client";

import { useState, type ReactNode } from "react";
import { adminSelfTest, type CheckResult } from "@/data/admin-selftest";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export const adminGhostBtn =
  "inline-flex h-8 shrink-0 items-center rounded-lg bg-black/[0.07] px-3 text-[0.72rem] font-semibold text-muted hover:bg-black/[0.12] disabled:opacity-50";

export function AdminSelfTest({
  section,
  label = "Проверить раздел",
  heading,
  extra,
}: {
  section: string;
  label?: string;
  heading?: ReactNode;
  extra?: ReactNode;
}) {
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

  async function run() {
    setBusy(true);
    setError("");
    setOpen(true);
    setCopied(false);
    const res = await adminSelfTest({ data: { token: token(), section } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Не удалось проверить");
      return;
    }
    setTitle(res.title);
    setHint(res.hint);
    setPass(res.pass);
    setFail(res.fail);
    setChecks(res.checks);
    setGrok(res.grok || "");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(grok);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">{heading}</div>
        <div className="flex shrink-0 items-center gap-2 pb-1">
          <button type="button" disabled={busy} onClick={() => void run()} className={adminGhostBtn}>
            {busy ? "Проверяю…" : label}
          </button>
          {extra}
          <InfoTip text="Сухой прогон: файлы, ключи API и связи с другими разделами. CRM и сайт не меняются. Сбой — простым языком плюс сырой ответ. Кнопка «Скопировать для Grok» собирает весь отчёт." />
        </div>
      </div>
      {open ? (
        <div className="mt-4 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
          {error ? <p className="text-sm text-primary">{error}</p> : null}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {title}
                <span className="ml-2 font-normal text-muted">
                  ок {pass}
                  {fail ? ` · сбоев ${fail}` : ""} · {checks.length} проверок · без записи
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
}

export function AdminSectionHead({
  section,
  title,
  tip,
  children,
}: {
  section: string;
  title: string;
  tip?: string;
  children?: ReactNode;
}) {
  return (
    <AdminSelfTest
      section={section}
      heading={
        <>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-3xl">{title}</h2>
            {tip ? <InfoTip text={tip} /> : null}
          </div>
          {children}
        </>
      }
    />
  );
}