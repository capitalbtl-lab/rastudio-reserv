"use client";

import { useEffect, useState } from "react";
import { adminCalls } from "@/data/admin";
import { Button } from "@/components/ui/button";
import { AdminSelfTest } from "@/components/admin-self-test";
import { AdminSaveBar } from "@/components/admin-save-bar";
import { cn } from "@/lib/utils";

type Tab = "overview" | "crm" | "texts" | "knowledge" | "settings";
type Crm = {
  age?: number | null;
  studyStatus?: string;
  groups?: string[];
  courseNote?: string;
  archived?: boolean;
  dropped?: boolean;
  isStudy?: boolean;
  months?: number;
  lastAttend?: string;
  branch?: string;
  comms?: string[];
};
type Row = { id: string; callstart: string; seconds: number; preview: string; crm?: Crm | null; turns?: { who: string; text: string }[] };
type Knowledge = {
  summary: string;
  faq: { q: string; a: string; on?: boolean }[];
  rules: Array<string | { text: string; on?: boolean }>;
  objections?: { q: string; a: string; on?: boolean }[];
  scripts?: { name: string; steps: string[]; on?: boolean }[];
  siteRecommendations?: Array<string | { text: string; on?: boolean }>;
  instructions?: Array<string | { text: string; on?: boolean }>;
  phrases?: Array<string | { text: string; on?: boolean }>;
};

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function Chip({ children, tone = "mute" }: { children: string; tone?: "mute" | "ok" | "warn" | "bad" }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "bg-amber-50 text-amber-900"
        : tone === "bad"
          ? "bg-rose-50 text-rose-800"
          : "bg-black/5 text-fg";
  return <span className={cn("rounded-full px-2.5 py-1 text-[0.72rem] font-medium", cls)}>{children}</span>;
}

function Dialogue({ turns, preview }: { turns?: { who: string; text: string }[]; preview: string }) {
  if (turns?.length) {
    return (
      <div className="mt-3 space-y-2">
        {turns.map((t, i) => (
          <p
            key={`${t.who}-${i}`}
            className={cn(
              "rounded-2xl px-3 py-2 text-sm leading-relaxed",
              t.who === "client" ? "bg-black/[0.04]" : t.who === "admin" ? "bg-brand/10" : "text-muted",
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t.who === "client" ? "Клиент" : t.who === "admin" ? "Администратор" : "Разговор"} ·{" "}
            </span>
            {t.text}
          </p>
        ))}
      </div>
    );
  }
  return <p className="mt-3 text-sm leading-relaxed text-muted">{preview}</p>;
}

function crmChips(c: Crm) {
  const out: { t: string; tone: "mute" | "ok" | "warn" | "bad" }[] = [];
  if (c.age) out.push({ t: `${c.age} лет`, tone: "mute" });
  if (c.studyStatus) {
    const s = c.studyStatus;
    out.push({
      t: s,
      tone: /архив|бросил|заверш/i.test(s) ? "bad" : /обуча|ждём|старта/i.test(s) ? "ok" : "warn",
    });
  }
  if (c.dropped) out.push({ t: "не ходит 60+ дней", tone: "bad" });
  if (c.archived) out.push({ t: "архив CRM", tone: "bad" });
  if (c.months) out.push({ t: `в студии ~${c.months} мес.`, tone: "mute" });
  const course = (c.groups || []).join(", ") || c.courseNote || "";
  if (course) out.push({ t: course, tone: "ok" });
  if (c.branch) out.push({ t: c.branch, tone: "mute" });
  if (c.lastAttend) out.push({ t: `занятие ${c.lastAttend}`, tone: "mute" });
  return out;
}

export function AdminCalls() {
  const [tab, setTab] = useState<Tab>("overview");
  const [filter, setFilter] = useState<"all" | "study" | "arch" | "none">("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [novoKey, setNovoKey] = useState("");
  const [novoSecret, setNovoSecret] = useState("");
  const [connected, setConnected] = useState(false);
  const [info, setInfo] = useState({ total: 0, transcribed: 0, failed: 0, pending: 0, matched: 0, studying: 0, archived: 0 });
  const [worker, setWorker] = useState<{ last?: string } | null>(null);
  const [settings, setSettings] = useState({
    minSeconds: 30,
    scanHours: 6,
    paused: false,
    autoKnowledge: true,
    inject: { faq: true, objections: true, scripts: true, phrases: true, rules: true, instructions: true, siteRecommendations: false },
  });
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function refresh() {
    const t = token();
    const [st, list] = await Promise.all([
      adminCalls({ data: { token: t, action: "status" } }),
      adminCalls({ data: { token: t, action: "list" } }),
    ]);
    if (st.ok) {
      setConnected(Boolean(st.connected));
      if (st.stats) {
        setInfo({
          total: st.stats.total,
          transcribed: st.stats.transcribed,
          failed: st.stats.failed,
          pending: st.stats.pending,
          matched: st.stats.matched || 0,
          studying: st.stats.studying || 0,
          archived: st.stats.archived || 0,
        });
        if (st.stats.worker) setWorker(st.stats.worker);
        if (st.stats.settings) setSettings({ ...settings, ...st.stats.settings, inject: { ...settings.inject, ...(st.stats.settings.inject || {}) } });
        if (st.stats.knowledge) setKnowledge(st.stats.knowledge as Knowledge);
      }
    }
    if (list.ok && list.transcripts) setRows(list.transcripts as Row[]);
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, []);

  const shown = rows.filter((r) => {
    if (filter === "study") return Boolean(r.crm?.isStudy) || /обуча/i.test(r.crm?.studyStatus || "");
    if (filter === "arch") return Boolean(r.crm?.archived || r.crm?.dropped);
    if (filter === "none") return !r.crm;
    return true;
  });

  function toggle(kind: string, index: number, on: boolean) {
    void adminCalls({ data: { token: token(), action: "toggle", kind, index, on } }).then((res) => {
      if (res.ok && res.knowledge) setKnowledge(res.knowledge as Knowledge);
    });
  }

  const pct = Math.min(100, Math.round((info.transcribed / Math.max(1, info.total)) * 100));
  const matchPct = Math.min(100, Math.round((info.matched / Math.max(1, info.transcribed)) * 100));

  return (
    <section className="mt-10 space-y-6">
      <div>
        <h2 className="font-display text-3xl">База звонков</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Звонок стыкуется с карточкой AlfaCRM: возраст, курс, учится или ушёл, переписка. Ольга берёт это в консультацию без ФИО и телефонов.
        </p>
        <div className="mt-3">
          <AdminSelfTest section="calls" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["overview", "Обзор"],
            ["crm", "Карточки CRM"],
            ["texts", "Расшифровки"],
            ["knowledge", "Знания Ольги"],
            ["settings", "Настройки"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("rounded-full px-4 py-2 text-sm font-medium", tab === id ? "bg-ink text-white" : "bg-surface")}
          >
            {label}
          </button>
        ))}
      </div>
      {err ? <p className="text-sm text-rose-700">{err}</p> : null}

      {tab === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["1. Novofon", "Записи дольше 30 сек"],
              ["2. Расшифровка", "Текст звонка"],
              ["3. AlfaCRM", "Возраст, курс, статус, переписка"],
              ["4. Ольга", "Говорит как живой администратор, отличая запрос клиента от ответа студии"],
            ].map(([t, d]) => (
              <div key={t} className="rounded-3xl bg-ink px-5 py-4 text-white">
                <p className="text-sm font-semibold">{t}</p>
                <p className="mt-1 text-sm text-white/70">{d}</p>
              </div>
            ))}
          </div>
          <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <p className="text-sm font-semibold">{settings.paused ? "Фон на паузе" : "Фон работает"}</p>
            <p className="mt-2 text-sm text-muted">{worker?.last || "Novofon → расшифровка → CRM → знания."}</p>
            <Button
              className="mt-4"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  const res = await adminCalls({ data: { token: token(), action: "settings", settings: { paused: !settings.paused } } });
                  setBusy(false);
                  if (res.ok && res.settings) setSettings({ ...settings, ...res.settings });
                })();
              }}
            >
              {settings.paused ? "Снять паузу" : "Пауза"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Записей", info.total],
              ["Расшифровано", info.transcribed],
              ["Связаны с CRM", info.matched],
              ["Учатся", info.studying],
              ["Архив / ушли", info.archived],
              ["Нет файла у Novofon", info.failed],
            ].map(([label, n]) => (
              <div key={String(label)} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
                <p className="text-sm text-muted">{label}</p>
                <p className="mt-1 font-display text-3xl">{n}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted">Расшифровка {pct}%</p>
            <div className="h-2 overflow-hidden rounded-full bg-black/10">
              <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted">Стыковка с CRM {matchPct}% от расшифрованных</p>
            <div className="h-2 overflow-hidden rounded-full bg-black/10">
              <div className="h-full rounded-full bg-ink" style={{ width: `${matchPct}%` }} />
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
            <div className="grid grid-cols-[8.5rem_1fr] border-b border-black/5 bg-black/[0.03] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted md:grid-cols-[12rem_1fr]">
              <span>В карточке</span>
              <span>Откуда в AlfaCRM</span>
            </div>
            {[
              ["Возраст", "дата рождения в карточке"],
              ["Курс / группа", "занятия + заметка «наименование курса»"],
              ["Статус", "учится / лид / архив / завершил / не ходит 60+ дней"],
              ["Сколько в студии", "с даты начала"],
              ["Переписка", "коммуникации в карточке (мессенджеры)"],
            ].map(([a, b]) => (
              <div key={a} className="grid grid-cols-[8.5rem_1fr] border-t border-black/5 px-5 py-3 text-sm md:grid-cols-[12rem_1fr]">
                <span className="font-semibold">{a}</span>
                <span className="text-muted">{b}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted">ФИО и телефоны в ИИ не уходят. Ольга видит: «7 лет, робототехника, бросил через 2 месяца».</p>
        </div>
      ) : null}

      {tab === "crm" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Все"],
                ["study", "Учатся"],
                ["arch", "Архив / ушли"],
                ["none", "Без CRM"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn("rounded-full px-3 py-1.5 text-sm", filter === id ? "bg-ink text-white" : "bg-surface")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {shown.length ? (
              shown.map((t) => (
                <article key={t.id} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
                  <p className="text-xs text-muted">{t.callstart} · {t.seconds} сек</p>
                  {t.crm ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {crmChips(t.crm).map((c) => (
                        <Chip key={c.t} tone={c.tone}>{c.t}</Chip>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted">Телефон звонка не совпал с карточкой, включая архив.</p>
                  )}
                  {t.crm?.comms?.length ? (
                    <div className="mt-3 rounded-2xl bg-black/[0.03] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Переписка</p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {t.crm.comms.slice(0, 3).map((c) => (
                          <li key={c}>«{c}»</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <Dialogue turns={t.turns} preview={t.preview} />
                </article>
              ))
            ) : (
              <p className="text-sm text-muted">Пока нет карточек в этом фильтре — фон стыкует новые расшифровки.</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "texts" ? (
        <div className="space-y-3">
          {rows.length ? (
            rows.map((t) => (
              <div key={t.id} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
                <p className="text-sm text-muted">{t.callstart} · {t.seconds} сек</p>
                {t.crm ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {crmChips(t.crm).map((c) => (
                      <Chip key={c.t} tone={c.tone}>{c.t}</Chip>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">В AlfaCRM по телефону не найден</p>
                )}
                {t.crm?.comms?.length ? <p className="mt-2 text-sm text-muted">Переписка: {t.crm.comms.join(" / ")}</p> : null}
                <Dialogue turns={t.turns} preview={t.preview} />
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">Расшифровок пока нет — фон в очереди.</p>
          )}
        </div>
      ) : null}

      {tab === "knowledge" ? (
        knowledge ? (
          <div className="space-y-4">
            <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
              <p className="text-sm font-semibold">Как говорят на линии</p>
              <p className="mt-3 text-sm leading-relaxed">{knowledge.summary}</p>
            </div>
            {([
              ["instructions", "Инструкции ИИ", knowledge.instructions],
              ["rules", "Правила", knowledge.rules],
              ["siteRecommendations", "Рекомендации сайту", knowledge.siteRecommendations],
              ["phrases", "Фразы", knowledge.phrases],
            ] as const).map(([kind, title, items]) =>
              items?.length ? (
                <div key={kind} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
                  <p className="text-sm font-semibold">{title}</p>
                  <ul className="mt-3 space-y-2">
                    {items.map((item, i) => {
                      const text = typeof item === "string" ? item : item.text;
                      const on = typeof item === "string" ? true : item.on !== false;
                      return (
                        <li key={`${kind}-${i}`} className="flex items-start gap-3 text-sm">
                          <input type="checkbox" checked={on} onChange={() => toggle(kind, i, !on)} />
                          <span className={on ? "" : "text-muted line-through"}>{text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null,
            )}
            {knowledge.scripts?.length ? (
              <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
                <p className="text-sm font-semibold">Скрипты</p>
                {knowledge.scripts.map((s, i) => (
                  <label key={s.name} className="mt-3 flex items-start gap-3">
                    <input type="checkbox" checked={s.on !== false} onChange={() => toggle("scripts", i, s.on === false)} />
                    <span>
                      <span className="text-sm font-semibold">{s.name}</span>
                      <span className="mt-1 block text-sm text-muted">{(s.steps || []).join(" → ")}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
              <p className="text-sm font-semibold">FAQ</p>
              {knowledge.faq.map((item, i) => (
                <label key={item.q} className="mt-4 flex items-start gap-3 border-t border-black/5 pt-4">
                  <input type="checkbox" checked={item.on !== false} onChange={() => toggle("faq", i, item.on === false)} />
                  <span>
                    <span className="block text-sm font-semibold">{item.q}</span>
                    <span className="mt-1 block text-sm text-muted">{item.a}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">База появится после нескольких расшифрованных консультаций.</p>
        )
      ) : null}

      {tab === "settings" ? (
        <div className="space-y-4">
          <div className="flex flex-col rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <p className="text-sm font-semibold">{connected ? "Novofon подключён" : "Ключи API"}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input placeholder="User key" value={novoKey} onChange={(e) => setNovoKey(e.target.value)} className="h-11 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              <input type="password" placeholder="Secret" value={novoSecret} onChange={(e) => setNovoSecret(e.target.value)} className="h-11 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
            </div>
            <AdminSaveBar>
              <Button
                disabled={busy || !novoKey || !novoSecret}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    const res = await adminCalls({ data: { token: token(), action: "connect", userKey: novoKey, secret: novoSecret } });
                    setBusy(false);
                    if (!res.ok) setErr(res.error);
                    else setConnected(true);
                  })();
                }}
              >
                Сохранить ключи
              </Button>
            </AdminSaveBar>
          </div>
          <div className="flex flex-col rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <p className="text-sm font-semibold">Параметры фона</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Минимум секунд
                <input type="number" min={10} max={600} value={settings.minSeconds} onChange={(e) => setSettings({ ...settings, minSeconds: Number(e.target.value) || 30 })} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              </label>
              <label className="text-sm">Скан новых звонков, часов
                <input type="number" min={1} max={24} value={settings.scanHours} onChange={(e) => setSettings({ ...settings, scanHours: Number(e.target.value) || 6 })} className="mt-1 h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              </label>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.autoKnowledge} onChange={(e) => setSettings({ ...settings, autoKnowledge: e.target.checked })} />
              Самой собирать базу знаний
            </label>
            <p className="mt-6 text-sm font-semibold">Что отдавать Ольге</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {([
                ["faq", "FAQ"],
                ["objections", "Возражения"],
                ["scripts", "Скрипты"],
                ["phrases", "Фразы"],
                ["rules", "Правила"],
                ["instructions", "Инструкции"],
                ["siteRecommendations", "Рекомендации сайту"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(settings.inject[k])} onChange={(e) => setSettings({ ...settings, inject: { ...settings.inject, [k]: e.target.checked } })} />
                  {label}
                </label>
              ))}
            </div>
            <AdminSaveBar>
              <Button
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    const res = await adminCalls({ data: { token: token(), action: "settings", settings } });
                    setBusy(false);
                    if (!res.ok) setErr(res.error);
                    else if (res.settings) setSettings({ ...settings, ...res.settings });
                  })();
                }}
              >
                Сохранить настройки
              </Button>
            </AdminSaveBar>
          </div>
        </div>
      ) : null}
    </section>
  );
}