"use client";

import { useEffect, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { HomeReadProvider } from "@/components/home-read";
import { unlockDebug } from "@/data/debug-fn";
import { tidyHttpError } from "@/data/http-error";
import { Button } from "@/components/ui/button";

type Prov = ComponentType<{ initial?: unknown; children: ReactNode }>;

const EDIT_KEY = "ra_edit";

function staffToken() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* */
  }
  try {
    return localStorage.getItem("ra_admin") || sessionStorage.getItem(EDIT_KEY) || "";
  } catch {
    return "";
  }
}

function rememberEdit(token: string) {
  try {
    sessionStorage.setItem(EDIT_KEY, token);
  } catch {
    /* */
  }
  try {
    localStorage.setItem("ra_admin", token);
  } catch {
    /* */
  }
  try {
    document.cookie = `ra_admin=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 7}`;
  } catch {
    /* */
  }
}

function wantsEdit() {
  try {
    if (sessionStorage.getItem(EDIT_KEY)) return true;
  } catch {
    /* */
  }
  try {
    if (!/(?:\?|&)edit=1(?:&|$)/.test(location.search)) return false;
    const t = staffToken();
    if (!t) return false;
    rememberEdit(t);
    return true;
  } catch {
    return false;
  }
}

function wantsPreview() {
  try {
    return /(?:\?|&)preview=1(?:&|$)/.test(location.search) && Boolean(staffToken());
  } catch {
    return false;
  }
}

function wantsUnlock() {
  try {
    return /(?:\?|&)edit=1(?:&|$)/.test(location.search) && !staffToken();
  } catch {
    return false;
  }
}

function EditorUnlock({ onIn }: { onIn: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  async function enter(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const res = await unlockDebug({ data: { password: pass } });
      if (!res.ok) {
        setErr(tidyHttpError("error" in res ? res.error : "", "Пароль не подошёл."));
        return;
      }
      rememberEdit(res.token);
      onIn();
    } catch (error) {
      setErr(tidyHttpError(error, "Кабинет перезапускается. Подождите несколько секунд."));
    }
  }
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4">
      <form className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]" onSubmit={(e) => void enter(e)}>
        <p className="font-display text-xl">Редактор сайта</p>
        <p className="mt-1 text-sm text-muted">Пароль — тот же, что у кабинета. Режим отладки не включается.</p>
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className="mt-4 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
          placeholder="Пароль"
          autoFocus
        />
        {err ? <p className="mt-2 text-sm text-primary">{err}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button type="submit">Войти</Button>
          <Button type="button" variant="secondary" onClick={() => (location.href = location.pathname || "/")}>
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}

export function HomeEditorGate({
  initial,
  children,
}: {
  initial?: unknown;
  children: ReactNode;
}) {
  const [Prov, setProv] = useState<Prov | null>(null);
  const [preview, setPreview] = useState<unknown>(null);
  const [unlock, setUnlock] = useState(false);
  useEffect(() => {
    const boot = () => {
      if (wantsPreview()) {
        setProv(null);
        setUnlock(false);
        const token = staffToken();
        void import("@/data/page-layout-fn").then(({ loadPageDocFn }) =>
          loadPageDocFn({ data: { token, path: location.pathname || "/", which: "draft" } }).then((res) => {
            if (res.ok && "layout" in res) setPreview(res.layout);
          }),
        );
        return;
      }
      if (wantsUnlock()) {
        setUnlock(true);
        setProv(null);
        return;
      }
      if (!wantsEdit()) {
        setUnlock(false);
        setProv(null);
        return;
      }
      setUnlock(false);
      void import("@/components/home-editor").then((m) => setProv(() => m.HomeEditorProvider));
    };
    boot();
    window.addEventListener("ra-edit-session", boot);
    return () => window.removeEventListener("ra-edit-session", boot);
  }, []);
  if (preview) return <HomeReadProvider initial={preview}>{children}</HomeReadProvider>;
  if (unlock) {
    return (
      <HomeReadProvider initial={initial}>
        {children}
        <EditorUnlock
          onIn={() => {
            setUnlock(false);
            window.dispatchEvent(new Event("ra-edit-session"));
          }}
        />
      </HomeReadProvider>
    );
  }
  if (!Prov) return <HomeReadProvider initial={initial}>{children}</HomeReadProvider>;
  return <Prov initial={initial}>{children}</Prov>;
}
