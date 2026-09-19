"use client";

import { useEffect, useState, type FormEvent } from "react";
import { editorLogin } from "@/data/editor-auth-fn";
import { tidyHttpError } from "@/data/http-error";
import { Button } from "@/components/ui/button";

const EDIT_KEY = "ra_edit";

function editUrl() {
  const path = location.pathname || "/";
  return path === "/" ? "/?edit=1" : `${path}?edit=1`;
}

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
      const res = await editorLogin({ data: { login, password: pass } });
      if (!res.ok) {
        setErr(tidyHttpError("error" in res ? res.error : "", "Неверный логин или пароль."));
        return;
      }
      rememberEdit(res.token);
      if (onIn) onIn();
      else location.href = editUrl();
    } catch (error) {
      setErr(tidyHttpError(error, "Сервер перезапускается. Подождите несколько секунд."));
    }
  }
  function cancel() {
    if (onCancel) onCancel();
    else location.href = location.pathname || "/";
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
          <Button type="button" variant="secondary" onClick={cancel}>
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Кнопка в подвале. Слева от «Режим отладки». */
export function EditorEntry() {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    const open = () => setAsk(true);
    window.addEventListener("ra-edit-open", open);
    return () => window.removeEventListener("ra-edit-open", open);
  }, []);
  return (
    <>
      <button
        type="button"
        className="inline-flex h-8 items-center rounded-full bg-white/10 px-3.5 text-[0.72rem] font-semibold text-header-fg hover:bg-white/16"
        onClick={() => {
          try {
            if (sessionStorage.getItem(EDIT_KEY)) {
              location.href = editUrl();
              return;
            }
          } catch {
            /* */
          }
          setAsk(true);
        }}
      >
        Редактор
      </button>
      {ask ? (
        <EditorUnlock
          onIn={() => {
            setAsk(false);
            location.href = editUrl();
          }}
          onCancel={() => setAsk(false)}
        />
      ) : null}
    </>
  );
}
