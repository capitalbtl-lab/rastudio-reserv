"use client";

import { useEffect, useState } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import type { CmsSession } from "@/data/cms";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "ещё не загружали";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AdminSchedule() {
  const [sessions, setSessions] = useState<CmsSession[]>([]);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await adminSchedule({ data: { token: token(), action: "get" } });
    if (res.ok && "sessions" in res) {
      setSessions(res.sessions);
      setAt(res.at || "");
    } else setMsg(res.ok ? "" : res.error || "Ошибка");
  }

  useEffect(() => {
    void load();
  }, []);

  async function pull() {
    setBusy(true);
    setMsg("Читаю группы и регулярные уроки из AlfaCRM…");
    const res = await adminSchedule({ data: { token: token(), action: "pull" } });
    setBusy(false);
    if (res.ok && "sessions" in res) {
      setSessions(res.sessions);
      setAt(res.at || "");
      setMsg(`Готово: ${res.count} слотов на сайте. Страницы курсов и /schedule берут это расписание.`);
    } else setMsg(res.ok ? "" : res.error || "AlfaCRM не ответила.");
  }

  const branches = [...new Set(sessions.map((s) => s.branch).filter(Boolean))];

  return (
    <section className="mt-10 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-3xl">Расписание из AlfaCRM</h2>
          <InfoTip text="Кнопка забирает живые группы и регулярные уроки из трёх филиалов (Гражданская, ЦМИТ, Луховицы). Слоты сразу попадают на rastudio.org/schedule и страницы курсов. Отложенные группы и служебные предметы не едут. Если CRM молчит, сайт покажет последний удачный снимок." />
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Последняя загрузка: {when(at)} · {sessions.length} слотов
          {branches.length ? ` · ${branches.join(" · ")}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onClick={() => void pull()}>
          Загрузить из AlfaCRM
        </Button>
        <InfoTip text="Принудительный запрос: group/index + regular-lesson/index по филиалам 1–3. Запись сохраняется в storage/crm-schedule.json и подхватывается сайтом без перезапуска. Нажмите, если в CRM поменяли день или открыли набор." />
      </div>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <div className="overflow-x-auto rounded-3xl bg-surface shadow-[var(--shadow-border)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-surface-2 text-[0.72rem] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">Группа / курс</th>
              <th className="px-3 py-3">Возраст</th>
              <th className="px-3 py-3">Когда</th>
              <th className="px-3 py-3">Филиал</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t border-black/6">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{s.group}</p>
                  <p className="text-xs text-muted">{s.courseFilter}</p>
                </td>
                <td className="px-3 py-2.5 text-muted">{s.age || "—"}</td>
                <td className="px-3 py-2.5">{s.when}</td>
                <td className="px-3 py-2.5 text-muted">
                  {s.city}
                  <span className="block text-xs">{s.branch}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sessions.length ? null : <p className="p-6 text-sm text-muted">Пока пусто — нажмите «Загрузить из AlfaCRM».</p>}
      </div>
    </section>
  );
}
