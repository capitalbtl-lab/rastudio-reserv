"use client";

import { useEffect, useState } from "react";
import { adminClearEdit, adminEdits } from "@/data/admin";
import { fieldLabel } from "@/data/edits-core";
import { Button } from "@/components/ui/button";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export function AdminVoiceEdits() {
  const [edits, setEdits] = useState<{ path: string; fields: Record<string, string> }[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const ed = await adminEdits({ data: { token: token() } });
    if (ed.ok) setEdits(ed.edits || []);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-2xl">Изменение сайта голосом</h3>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Олег и Ольга правят тексты и цены, когда открыт голосовой доступ. Ниже — как говорить и что уже изменено.
        </p>
      </div>
      <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <p className="text-sm font-semibold">Настройки сценария</p>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed">
          <li>1. Откройте нужную страницу сайта и включите голосовой режим в чате.</li>
          <li>2. Скажите: «хочу внести изменения на сайт».</li>
          <li>3. Назовите кодовое слово из раздела «Голосовой доступ».</li>
          <li>4. Скажите, что менять. Страница обновится сама.</li>
        </ol>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <p className="rounded-2xl bg-surface-2 p-4 text-sm">
            <span className="font-semibold">Главная:</span> «заголовок», «текст под заголовком».
          </p>
          <p className="rounded-2xl bg-surface-2 p-4 text-sm">
            <span className="font-semibold">Курс:</span> «заголовок», «описание», «текст о курсе», «почему сейчас».
          </p>
          <p className="rounded-2xl bg-surface-2 p-4 text-sm">
            <span className="font-semibold">Цена:</span> «поставь художественной студии 3–4 3200» или «всей школе плюс 200».
          </p>
          <p className="rounded-2xl bg-surface-2 p-4 text-sm">
            <span className="font-semibold">Сброс:</span> «верни исходный заголовок». Кнопка «Вернуть» ниже делает то же.
          </p>
        </div>
      </div>
      <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <p className="text-sm font-semibold">Что уже изменено голосом</p>
        {edits.length ? (
          <ul className="mt-3 space-y-3">
            {edits.map((item) => (
              <li key={item.path} className="rounded-2xl bg-surface-2 p-3">
                <p className="text-sm font-semibold">{item.path}</p>
                {Object.entries(item.fields).map(([key, value]) => (
                  <p key={key} className="mt-2 flex items-start justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium">{fieldLabel(key)}:</span> {value.slice(0, 180)}
                      {value.length > 180 ? "…" : ""}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto shrink-0 px-2 py-1 text-xs"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        await adminClearEdit({ data: { token: token(), path: item.path, field: key } });
                        await load();
                        setBusy(false);
                      }}
                    >
                      Вернуть
                    </Button>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Пока нет правок текстов — на сайте исходные формулировки.</p>
        )}
      </div>
    </div>
  );
}
