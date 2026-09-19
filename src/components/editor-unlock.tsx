"use client";

import { useState, type FormEvent } from "react";
import { tidyHttpError } from "@/data/http-error";
import { Button } from "@/components/ui/button";

const EDIT_KEY = "ra_edit";

function rememberEdit(token: string) {
  try {
    sessionStorage.setItem(EDIT_KEY, token);
  } catch {
    /* */
  }
}

export function EditorUnlock({ onIn, onCancel }: { onIn?: () => void; onCancel?: () => void }) {
  const [login, setLogin] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  async function enter(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const { editorLogin } = await import("@/data/editor-auth-fn");
      const res = await editorLogin({ data: { login, password: pass } });
      if (!res.ok) {
        setErr(tidyHttpError("error" in res ? res.error : "", "Неверный логин или пароль."));
        return;
      }
      rememberEdit(res.token);
      onIn?.();
    } catch (error) {
      setErr(tidyHttpError(error, "Сервер перезапускается. Подождите несколько секунд."));
    }
  }
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4">
      <form className="w-full max-w-sm rounded-3xl bg-surface p-5 text-fg shadow-[var(--shadow-border)]" onSubmit={(e) => void enter(e)}>
        <p className="font-display text-xl">Редактор сайта</p>
        <p className="mt-1 text-sm text-muted">Вход по логину и паролю. Режим отладки не включается.</p>
        <label className="mt-4 block text-[0.72rem] font-semibold text-muted">
          Логин
          <input
            type="text"
            name="login"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 text-sm font-normal text-fg ring-1 ring-black/10"
            placeholder="Логин"
            autoFocus
          />
        </label>
        <label className="mt-3 block text-[0.72rem] font-semibold text-muted">
          Пароль
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 text-sm font-normal text-fg ring-1 ring-black/10"
            placeholder="Пароль"
          />
        </label>
        {err ? <p className="mt-2 text-sm text-primary">{err}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button type="submit">Войти</Button>
          <Button type="button" variant="secondary" onClick={() => onCancel?.()}>
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}
