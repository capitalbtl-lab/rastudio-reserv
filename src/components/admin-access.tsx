"use client";

import { useEffect, useState } from "react";
import { adminMeta, adminSetCodeword, adminSetPassword } from "@/data/admin";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { AdminSaveBar } from "@/components/admin-save-bar";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export function AdminAccess() {
  const [word, setWord] = useState("");
  const [newPass, setNewPass] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ at: string; text: string }[]>([]);

  useEffect(() => {
    void (async () => {
      const meta = await adminMeta({ data: { token: token() } });
      if (meta.ok) setLog(meta.log || []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-2xl">Голосовой доступ</h3>
          <InfoTip text="Кодовое слово открывает правки сайта через чат на 30 минут. Пароль — вход в этот кабинет. Голоса Олега и Ольги настраиваются во вкладке «Голоса»." />
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">Кодовое слово для режима управления и пароль этой страницы.</p>
      </div>

      <div className="flex flex-col rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <p className="text-sm font-semibold">
          Кодовое слово <InfoTip className="ml-1" text="Ольга спросит его после «войти в административный режим». Вслух в чат не произносится. Минимум 4 буквы. Действует 30 минут, потом снова спросить." />
        </p>
        <p className="mt-1 text-sm text-muted">Ольга спросит его, когда попросите изменить сайт.</p>
        <label className="mt-4 text-sm">
          Новое кодовое слово
          <input
            type="password"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            className="mt-1 block h-11 w-56 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
          />
        </label>
        <AdminSaveBar>
          <Button
            type="button"
            disabled={busy || word.trim().length < 4}
            onClick={async () => {
              setBusy(true);
              const res = await adminSetCodeword({ data: { token: token(), word } });
              setBusy(false);
              setMsg(res.ok ? "Слово обновлено" : res.error || "Ошибка");
              if (res.ok) setWord("");
            }}
          >
            Сохранить слово
          </Button>
        </AdminSaveBar>
      </div>

      <div className="flex flex-col rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <p className="text-sm font-semibold">
          Пароль кабинета <InfoTip className="ml-1" text="Им входите на rastudio.org/admin. Не путать с кодовым словом чата. Минимум 6 символов." />
        </p>
        <p className="mt-1 text-sm text-muted">Им входите на эту страницу. Минимум 6 символов.</p>
        <label className="mt-4 text-sm">
          Новый пароль кабинета
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            className="mt-1 block h-11 w-56 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
          />
        </label>
        <AdminSaveBar>
          <Button
            type="button"
            disabled={busy || newPass.trim().length < 6}
            onClick={async () => {
              setBusy(true);
              const res = await adminSetPassword({ data: { token: token(), password: newPass } });
              setBusy(false);
              setMsg(res.ok ? "Пароль кабинета обновлён" : res.error || "Ошибка");
              if (res.ok) setNewPass("");
            }}
          >
            Сохранить пароль
          </Button>
        </AdminSaveBar>
      </div>

      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      {log.length ? (
        <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
          <p className="text-sm font-semibold">Журнал</p>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {log.slice(0, 12).map((item) => (
              <li key={item.at}>
                {new Date(item.at).toLocaleString("ru-RU")} — {item.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
