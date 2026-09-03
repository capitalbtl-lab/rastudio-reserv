"use client";

import { useEffect, useState } from "react";
import { adminSectionGuides, FACTORY_GUIDES, GUIDE_REV, type SectionGuide } from "@/data/agent-section-guides";
import { Button } from "@/components/ui/button";
import { AdminSaveBar } from "@/components/admin-save-bar";
import { InfoTip, TipWrap } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AdminSectionGuides() {
  const [guides, setGuides] = useState<SectionGuide[]>(FACTORY_GUIDES);
  const [active, setActive] = useState("schedule");
  const [body, setBody] = useState(FACTORY_GUIDES[0]?.body || "");
  const [on, setOn] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const guide = guides.find((g) => g.id === active) || guides[0];

  async function load() {
    try {
      const res = await adminSectionGuides({ data: { token: token(), action: "get" } });
      if (!res.ok || !("guides" in res) || !res.guides?.length) {
        setMsg(res.ok ? "" : res.error || "Не удалось загрузить правки. Показана заводская база.");
        return;
      }
      setGuides(res.guides);
      const first = res.guides.find((g) => g.id === active) || res.guides[0];
      if (first) {
        setActive(first.id);
        setBody(first.body);
        setOn(first.on);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Сервер не ответил. Показана заводская база.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(id: string) {
    const g = guides.find((x) => x.id === id);
    if (!g) return;
    setActive(id);
    setBody(g.body);
    setOn(g.on);
    setMsg("");
  }

  async function save() {
    if (!guide) return;
    setBusy(true);
    const res = await adminSectionGuides({
      data: { token: token(), action: "save", id: guide.id, on, body },
    });
    setBusy(false);
    if (res.ok && "guides" in res) {
      setGuides(res.guides);
      setMsg(on ? "Сохранено. Агент расписания читает эту инструкцию." : "Сохранено. Инструкция выключена — агент её не видит.");
    } else setMsg(res.ok ? "" : res.error || "Ошибка");
  }

  async function reset() {
    if (!guide) return;
    if (!window.confirm("Вернуть заводскую Карту ID для этого раздела? Правки текста сотрутся.")) return;
    setBusy(true);
    const res = await adminSectionGuides({ data: { token: token(), action: "reset", id: guide.id } });
    setBusy(false);
    if (res.ok && "guides" in res) {
      setGuides(res.guides);
      const g = res.guides.find((x) => x.id === guide.id);
      if (g) {
        setBody(g.body);
        setOn(g.on);
      }
      setMsg("Заводская инструкция восстановлена.");
    } else setMsg(res.ok ? "" : res.error || "Ошибка");
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-3xl">База знаний ИИ</h2>
          <InfoTip text="Сюда кладутся правила, по которым ИИ управляет кабинетом. Это не скрипт разговора с родителем. Сейчас заполнен раздел «Расписание занятий». Другие разделы добавятся сюда же." />
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Агент читает включённую инструкцию, когда работает с этим разделом. Сопоставление — только по ID. Это единственный источник правил раздела для ИИ.
        </p>
      </div>

      <div className="flex items-end gap-1 border-b border-black/10">
        {guides.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => pick(g.id)}
            className={cn(
              "rounded-t-xl px-5 py-2.5 text-sm font-semibold",
              g.id === (guide?.id || active) ? "bg-primary text-primary-foreground" : "bg-surface-2 text-fg hover:bg-surface",
            )}
          >
            {g.title}
          </button>
        ))}
      </div>

      {!guide ? (
        <p className="text-sm text-muted">{msg || "Загрузка…"}</p>
      ) : (
        <div className="space-y-4">
          <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6" data-guide-id={guide.id} data-guide-rev={GUIDE_REV}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl">{guide.title}</p>
                <p className="mt-1 text-sm text-muted">{guide.summary}</p>
                <p className="mt-1 font-mono text-[0.7rem] text-muted">REV {GUIDE_REV} · id={guide.id}</p>
              </div>
              <label className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm">
                <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
                <span className="font-semibold">{on ? "в промпте агента" : "не отдавать агенту"}</span>
                <InfoTip text="Включено — голосовой агент расписания получает этот текст. Выключено — остаётся только короткая Карта ID." />
              </label>
            </div>
          </article>

          <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <div className="flex items-center gap-2">
              <p className="font-display text-lg">Карта ID</p>
              <InfoTip text="Жёсткий граф. Агент не имеет права связывать сущности по названию. Ключ — только поле ID." />
            </div>
            <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-black/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Сущность</th>
                    <th className="px-3 py-2 font-semibold">ID</th>
                    <th className="px-3 py-2 font-semibold">Связь</th>
                  </tr>
                </thead>
                <tbody>
                  {guide.graph.map((row) => (
                    <tr key={row.idField} className="border-t border-black/5">
                      <td className="px-3 py-2 font-semibold">{row.entity}</td>
                      <td className="px-3 py-2 font-mono text-[0.78rem]">{row.idField}</td>
                      <td className="px-3 py-2 text-muted">{row.link}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <div className="flex items-center gap-2">
              <p className="font-display text-lg">Каскад courseId группы</p>
              <InfoTip text="Порядок без имён. Если ни один шаг не дал ID — группа в «Без курса». Сама оттуда не уедет." />
            </div>
            <ol className="mt-3 space-y-2 text-sm">
              {guide.cascade.map((step, i) => (
                <li key={step} className="flex gap-3 rounded-xl bg-surface-2 px-3 py-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[0.7rem] font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </article>

          <div className="grid gap-3 md:grid-cols-2">
            {guide.tabs.map((tab) => (
              <article key={tab.id} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]" data-guide-tab={tab.id}>
                <p className="font-display text-lg">{tab.title}</p>
                <p className="mt-1 font-mono text-[0.68rem] text-muted">tab:{tab.id}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{tab.body}</p>
              </article>
            ))}
          </div>

          <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <div className="flex items-center gap-2">
              <p className="font-display text-lg">Операции агента</p>
              <InfoTip text="Что агент умеет делать в этом разделе. Нет ID в запросе — уточнить, не угадывать." />
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {guide.ops.map((op) => (
                <li key={op.id} className="rounded-xl bg-surface-2 px-3 py-2" data-guide-op={op.id}>
                  <span className="font-mono text-[0.68rem] text-muted">{op.id}</span>
                  <span className="ml-2 font-semibold">{op.title}.</span> <span className="text-muted">{op.body}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl bg-surface-2 px-3 py-3 text-sm">
              <p className="font-semibold">Запреты</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {guide.never.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </article>

          <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <div className="flex items-center gap-2">
              <p className="font-display text-lg">Текст, который читает модель</p>
              <InfoTip text="Это уходит в промпт агента расписания, если тумблер включён. Карточки сверху — закон. Здесь можно уточнить формулировку, не ломая Карту ID." />
            </div>
            {guide.updatedAt ? <p className="mt-1 text-xs text-muted">Правка: {when(guide.updatedAt)}</p> : null}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={22}
              className="mt-3 w-full resize-y rounded-xl bg-surface-2 px-3 py-2.5 font-mono text-[0.78rem] leading-relaxed ring-1 ring-black/10"
            />
            <AdminSaveBar>
              <TipWrap text="Возвращает заводской текст Карты ID. Тумблер «в промпте» тоже станет включён.">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void reset()}>
                  Вернуть заводской
                </Button>
              </TipWrap>
              <TipWrap text="Пишет текст и тумблер. Агент расписания подхватит сразу, без перезапуска сайта.">
                <Button type="button" disabled={busy} onClick={() => void save()}>
                  Сохранить
                </Button>
              </TipWrap>
            </AdminSaveBar>
            {msg ? <p className="mt-2 text-right text-sm text-primary">{msg}</p> : null}
          </article>
        </div>
      )}
    </div>
  );
}
