"use client";

import { useState } from "react";
import { adminSelfTest, type CheckResult } from "@/data/admin-selftest";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export function AdminSelfTest({ section }: { section: string }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");
  const [pass, setPass] = useState(0);
  const [fail, setFail] = useState(0);
  const [future, setFuture] = useState(false);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setOpen(true);
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
    setFuture(Boolean(res.future));
    setChecks(res.checks);
  }

  return (
    <div className="w-full max-w-xl">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="h-8 rounded-lg bg-black/[0.07] px-3 text-[0.72rem] font-semibold text-muted hover:bg-black/[0.12] disabled:opacity-50"
        >
          {busy ? "Проверяю…" : "Проверить раздел"}
        </button>
        <InfoTip text="Сухой прогон: читаем файлы и пингуем API. Цены, CRM, звонки, сайт не меняются. Если раздела ещё нет в каталоге — сработает общий контур (диск и ключи). Новый раздел подключается через registerAdminSection." />
      </div>
      {open ? (
        <div className="mt-2 rounded-2xl bg-surface-2 p-3">
          {error ? <p className="text-sm text-primary">{error}</p> : null}
          {title ? (
            <p className="text-xs font-semibold text-fg">
              {title}
              {future ? " · общий контур" : ""}
              <span className="ml-2 font-normal text-muted">
                ок {pass}
                {fail ? ` · сбой ${fail}` : ""} · без записи
              </span>
            </p>
          ) : null}
          {hint ? <p className="mt-1 text-[0.72rem] leading-relaxed text-muted">{hint}</p> : null}
          <ul className="mt-2 space-y-1.5">
            {checks.map((c) => (
              <li key={c.id} className="text-[0.78rem] leading-snug">
                <span className={cn("mr-1.5 font-semibold", c.ok ? "text-emerald-700" : c.skip ? "text-muted" : "text-primary")}>
                  {c.ok ? "ок" : c.skip ? "—" : "сбой"}
                </span>
                <span className="font-medium">{c.title}.</span> {c.detail}
                <span className="ml-1 text-[0.65rem] text-muted">{c.ms}мс</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}