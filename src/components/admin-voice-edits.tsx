"use client";

import { useEffect, useMemo, useState } from "react";
import { adminClearEdit, adminEdits } from "@/data/admin";
import { fieldLabel } from "@/data/edits-core";
import { Button } from "@/components/ui/button";
import { AdminSaveBar } from "@/components/admin-save-bar";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

type EditRow = { path: string; title?: string; fields: Record<string, string> };

export function AdminVoiceEdits() {
  const [edits, setEdits] = useState<EditRow[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState<{ path: string; field: string; value: string } | null>(null);

  async function load() {
    const ed = await adminEdits({ data: { token: token() } });
    if (ed.ok) setEdits((ed.edits || []) as EditRow[]);
    else setMsg(ed.error || "Не удалось прочитать правки.");
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(""), 2500);
    return () => window.clearTimeout(t);
  }, [msg]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return edits;
    return edits.filter((item) => (item.title || item.path).toLowerCase().includes(s) || item.path.toLowerCase().includes(s));
  }, [edits, q]);

  const pages = edits.length;
  const fields = edits.reduce((n, item) => n + Object.keys(item.fields || {}).length, 0);

  async function revert(path: string, field?: string, all = false) {
    setBusy(`${path}:${field || "all"}`);
    const res = await adminClearEdit({ data: { token: token(), path, field, all } });
    setBusy("");
    if (res.ok && "edits" in res && Array.isArray(res.edits)) setEdits(res.edits as EditRow[]);
    else await load();
    setMsg(res.ok ? (all ? "Страница как в каталоге." : "Поле вернули.") : res.error || "Ошибка");
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(`${draft.path}:${draft.field}`);
    const res = await adminClearEdit({
      data: { token: token(), path: draft.path, field: draft.field, value: draft.value },
    });
    setBusy("");
    if (res.ok && "edits" in res && Array.isArray(res.edits)) setEdits(res.edits as EditRow[]);
    else await load();
    setMsg(res.ok ? "Сохранено. На сайте — после обновления страницы." : res.error || "Ошибка");
    if (res.ok) setDraft(null);
  }

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted">
        Тексты rastudio.org после кодового слова или правкой здесь. Цены — «Группы, цены». CRM — карточка клиента. Кодовое слово — «Голосовой доступ».
      </p>

      <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <p className="text-sm font-semibold">Как говорить в чате</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>Откройте страницу на сайте, в чате — «войти в административный режим», кодовое слово.</li>
          <li>«Заголовок: …», «описание: …», «о курсе: …», «почему сейчас: заголовок — текст».</li>
          <li>Главная: «главный заголовок» и «текст под заголовком».</li>
          <li>«Верни исходный заголовок» — сброс поля. Кнопки ниже делают то же без голоса.</li>
        </ol>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-sm">
          Найти страницу
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Главная, художественная…"
            className="mt-1 block h-11 w-72 max-w-full rounded-xl bg-surface px-3 text-sm shadow-[var(--shadow-border)]"
          />
        </label>
        <p className="text-sm text-muted">{pages ? `${fields} на ${pages} стр.` : "Правок нет"}</p>
      </div>

      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((item) => (
            <li key={item.path} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.title || item.path}</p>
                  <p className="text-[0.72rem] text-muted">{item.path}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto px-2 py-1 text-xs"
                  disabled={Boolean(busy)}
                  onClick={() => void revert(item.path, undefined, true)}
                >
                  Вернуть страницу
                </Button>
              </div>
              <ul className="mt-3 space-y-3">
                {Object.entries(item.fields).map(([key, value]) => {
                  const open = draft?.path === item.path && draft.field === key;
                  return (
                    <li key={key} className="rounded-2xl bg-surface-2 p-3">
                      <p className="text-sm font-medium">{fieldLabel(key)}</p>
                      {open ? (
                        <>
                          <textarea
                            value={draft.value}
                            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                            rows={4}
                            className="mt-2 w-full rounded-xl bg-surface px-3 py-2 text-sm ring-1 ring-black/10"
                          />
                          <AdminSaveBar>
                            <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => setDraft(null)}>
                              Отмена
                            </Button>
                            <Button type="button" disabled={Boolean(busy)} onClick={() => void saveDraft()}>
                              Сохранить текст
                            </Button>
                          </AdminSaveBar>
                        </>
                      ) : (
                        <div className="mt-1 flex items-start justify-between gap-3">
                          <p className="text-sm text-muted">{value.length > 280 ? `${value.slice(0, 280)}…` : value}</p>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto px-2 py-1 text-xs"
                              disabled={Boolean(busy)}
                              onClick={() => setDraft({ path: item.path, field: key, value })}
                            >
                              Править
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto px-2 py-1 text-xs"
                              disabled={Boolean(busy)}
                              onClick={() => void revert(item.path, key)}
                            >
                              Вернуть
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-3xl bg-surface px-5 py-6 text-sm text-muted shadow-[var(--shadow-border)]">
          {q ? "Нет страниц по этому поиску." : "Пока исходные тексты каталога. Откройте страницу на сайте и скажите «заголовок: …»."}
        </p>
      )}
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
    </div>
  );
}
