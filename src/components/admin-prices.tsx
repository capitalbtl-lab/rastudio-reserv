"use client";

import { useEffect, useMemo, useState } from "react";
import {
  adminLogin,
  adminPrices,
  adminSaveGroup,
  adminSavePrice,
  adminCalls,
} from "@/data/admin";
import { PRICE_DIRECTIONS, hydratePrices, type PriceRow } from "@/data/prices-core";
import { Button } from "@/components/ui/button";
import { AdminCalls } from "@/components/admin-calls";
import { AdminAgent } from "@/components/admin-agent";
import { AdminDossiers } from "@/components/admin-dossiers";
import { AdminSchedule } from "@/components/admin-schedule";
import { AdminIntegrations } from "@/components/admin-integrations";
import { AdminSaveBar } from "@/components/admin-save-bar";
import { adminGhostBtn, AdminSectionHead, AdminSelfTest } from "@/components/admin-self-test";
import { adminPriceFormulas, type CorpFormulas } from "@/data/price-formulas";
import { InfoTip, TipWrap } from "@/components/info-tip";
import { cn } from "@/lib/utils";

const KEY = "ra_admin";
type Tab = "prices" | "schedule" | "agent" | "calls" | "dossiers" | "apis";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "prices", label: "Цены курсов", hint: "Прайс, КБМ и ТМХ" },
  { id: "schedule", label: "Расписание занятий", hint: "Группы студии" },
  { id: "agent", label: "Ассистент ИИ", hint: "Окно, обучение агентов, доступ" },
  { id: "calls", label: "База звонков", hint: "Novofon → знания" },
  { id: "dossiers", label: "Личные дела", hint: "Клиенты AlfaCRM" },
  { id: "apis", label: "API и интеграции", hint: "Yandex, CRM, телефония" },
];

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem(KEY) || "";
}

function persist(t: string) {
  localStorage.setItem(KEY, t);
  document.cookie = `ra_admin=${encodeURIComponent(t)}; path=/; max-age=${7 * 24 * 3600}; samesite=lax`;
}

function logout() {
  localStorage.removeItem(KEY);
  document.cookie = "ra_admin=; path=/; max-age=0; samesite=lax";
}

export function AdminPrices() {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [in_, setIn] = useState(false);
  const [tab, setTab] = useState<Tab>("prices");
  const [dir, setDir] = useState(PRICE_DIRECTIONS[0]);
  const [field, setField] = useState<"all" | "kbm" | "tmx" | "all-three">("all");
  const [mode, setMode] = useState<"set" | "delta">("set");
  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);
  const [novoKey, setNovoKey] = useState("");
  const [novoSecret, setNovoSecret] = useState("");
  const [callsConnected, setCallsConnected] = useState(false);
  const [callInfo, setCallInfo] = useState({ total: 0, transcribed: 0, failed: 0, pending: 0, scannedAt: "", matched: 0, studying: 0, archived: 0 });
  const [knowledge, setKnowledge] = useState<{
    summary: string;
    faq: { q: string; a: string; on?: boolean }[];
    rules: Array<string | { text: string; on?: boolean }>;
    objections?: { q: string; a: string; on?: boolean }[];
    scripts?: { name: string; steps: string[]; on?: boolean }[];
    siteRecommendations?: Array<string | { text: string; on?: boolean }>;
    instructions?: Array<string | { text: string; on?: boolean }>;
    phrases?: Array<string | { text: string; on?: boolean }>;
  } | null>(null);
  const [worker, setWorker] = useState<{ last?: string; updated?: string; running?: boolean } | null>(null);
  const [callSet, setCallSet] = useState({
    minSeconds: 30,
    scanHours: 6,
    paused: false,
    autoKnowledge: true,
    inject: { faq: true, objections: true, scripts: true, phrases: true, rules: true, instructions: true, siteRecommendations: false },
  });
  const [transcripts, setTranscripts] = useState<
    {
      id: string;
      callstart: string;
      seconds: number;
      preview: string;
      crm?: {
        age?: number | null;
        studyStatus?: string;
        groups?: string[];
        courseNote?: string;
        archived?: boolean;
        dropped?: boolean;
        months?: number;
        lastAttend?: string;
        branch?: string;
        comms?: string[];
      } | null;
    }[]
  >([]);
  const [callView, setCallView] = useState<"overview" | "settings" | "knowledge" | "texts">("overview");
  const [formulas, setFormulas] = useState<CorpFormulas>({ kbm: { mode: "percent", value: 100 }, tmx: { mode: "percent", value: 100 } });
  const [corpDir, setCorpDir] = useState("");

  async function load(t = token()) {
    if (!t) return;
    const res = await adminPrices({ data: { token: t } });
    if (!res.ok) {
      setIn(false);
      setErr(res.error);
      return;
    }
    setRows(res.rows);
    hydratePrices(res.rows);
    setIn(true);
    setErr("");
    const calls = await adminCalls({ data: { token: t, action: "status" } });
    if (calls.ok) {
      setCallsConnected(Boolean(calls.connected));
      if (calls.stats) {
        setCallInfo({
          total: calls.stats.total,
          transcribed: calls.stats.transcribed,
          failed: calls.stats.failed,
          pending: calls.stats.pending,
          scannedAt: calls.stats.scannedAt || "",
          matched: calls.stats.matched || 0,
          studying: calls.stats.studying || 0,
          archived: calls.stats.archived || 0,
        });
        if (calls.stats.knowledge) {
          setKnowledge({
            summary: calls.stats.knowledge.summary,
            faq: calls.stats.knowledge.faq,
            rules: calls.stats.knowledge.rules,
            objections: calls.stats.knowledge.objections,
            scripts: calls.stats.knowledge.scripts,
            siteRecommendations: calls.stats.knowledge.siteRecommendations,
            instructions: calls.stats.knowledge.instructions,
            phrases: calls.stats.knowledge.phrases,
          });
        }
        if (calls.stats.worker) setWorker(calls.stats.worker);
        if (calls.stats.settings) setCallSet({ ...callSet, ...calls.stats.settings, inject: { ...callSet.inject, ...(calls.stats.settings.inject || {}) } });
      }
    }
    const listed = await adminCalls({ data: { token: t, action: "list" } });
    if (listed.ok && listed.transcripts) setTranscripts(listed.transcripts);
    const form = await adminPriceFormulas({ data: { token: t, action: "get" } });
    if (form.ok && "formulas" in form && form.formulas) setFormulas(form.formulas);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!in_ || tab !== "calls") return;
    const id = window.setInterval(() => {
      void (async () => {
        const calls = await adminCalls({ data: { token: token(), action: "status" } });
        if (!calls.ok || !calls.stats) return;
        setCallInfo({
          total: calls.stats.total,
          transcribed: calls.stats.transcribed,
          failed: calls.stats.failed,
          pending: calls.stats.pending,
          scannedAt: calls.stats.scannedAt || "",
          matched: calls.stats.matched || 0,
          studying: calls.stats.studying || 0,
          archived: calls.stats.archived || 0,
        });
        if (calls.stats.knowledge) {
          setKnowledge({
            summary: calls.stats.knowledge.summary,
            faq: calls.stats.knowledge.faq,
            rules: calls.stats.knowledge.rules,
            objections: calls.stats.knowledge.objections,
            scripts: calls.stats.knowledge.scripts,
            siteRecommendations: calls.stats.knowledge.siteRecommendations,
            instructions: calls.stats.knowledge.instructions,
            phrases: calls.stats.knowledge.phrases,
          });
        }
        if (calls.stats.worker) setWorker(calls.stats.worker);
        if (calls.stats.settings) setCallSet({ ...callSet, ...calls.stats.settings, inject: { ...callSet.inject, ...(calls.stats.settings.inject || {}) } });
      })();
    }, 8000);
    return () => window.clearInterval(id);
  }, [in_, tab]);

  const grouped = useMemo(() => {
    const map = new Map<string, PriceRow[]>();
    for (const row of rows) {
      const list = map.get(row.direction) || [];
      list.push(row);
      map.set(row.direction, list);
    }
    return [...map.entries()];
  }, [rows]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await adminLogin({ data: { password: pass } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    persist(res.token);
    await load(res.token);
  }

  async function saveRow(row: PriceRow) {
    setBusy(true);
    const res = await adminSavePrice({
      data: { token: token(), path: row.path, all: row.all, kbm: row.kbm, tmx: row.tmx },
    });
    setBusy(false);
    if (!res.ok) setErr(res.error);
    else await load();
  }

  async function applyGroup() {
    const n = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n)) return;
    setBusy(true);
    const res = await adminSaveGroup({
      data: {
        token: token(),
        direction: dir,
        field,
        ...(mode === "set" ? { set: n } : { delta: n }),
      },
    });
    setBusy(false);
    if (!res.ok) setErr(res.error);
    else await load();
  }

  function patch(path: string, key: "all" | "kbm" | "tmx", value: string) {
    const n = Number(value.replace(/\s/g, ""));
    setRows((prev) => prev.map((r) => (r.path === path ? { ...r, [key]: Number.isFinite(n) ? n : 0 } : r)));
  }

  if (!in_) {
    return (
      <article className="page-wrap py-16">
        <p className="kicker">Только для администратора студии</p>
        <h1 className="display mt-3 text-4xl">Кабинет администратора</h1>
        <form className="mt-8 max-w-md space-y-4" onSubmit={login}>
          <label className="block text-sm font-medium">
            Пароль
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="mt-1 h-12 w-full rounded-2xl bg-surface-2 px-4 outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-primary/40"
            />
          </label>
          {err ? <p className="text-sm text-primary">{err}</p> : null}
          <Button type="submit" disabled={busy || !pass}>
            Войти
          </Button>
        </form>
      </article>
    );
  }

  return (
    <article className="page-wrap py-10 md:py-14">
      <AdminSelfTest
        section="cabinet"
        label="Проверка кабинета"
        heading={
          <>
            <p className="kicker">Кабинет администратора</p>
            <h1 className="display mt-3 text-4xl">Кабинет администратора</h1>
          </>
        }
        extra={
          <button
            type="button"
            className={adminGhostBtn}
            onClick={() => {
              logout();
              setIn(false);
            }}
          >
            Выйти
          </button>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-3xl p-5 text-left shadow-[var(--shadow-border)] transition",
              tab === item.id ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-surface-2",
            )}
          >
            <p className="font-display text-xl leading-tight">{item.label}</p>
            <p className={cn("mt-1 text-sm", tab === item.id ? "text-white/75" : "text-muted")}>{item.hint}</p>
          </button>
        ))}
      </div>

      {err ? <p className="mt-4 text-sm text-primary">{err}</p> : null}

      {tab === "prices" ? (
        <section className="mt-10">
          <AdminSectionHead section="prices" title="Цены курсов">
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Колонка «Все» на сайте. КБМ и ТМХ — корпоративные. Формула считает их от «Все»: плюс сумма или умножение на процент.
            </p>
          </AdminSectionHead>
          <div className="mt-4 flex items-start gap-1">
            <TipWrap text="Когда в AlfaCRM появятся абонементы, эта кнопка заберёт их из tariff/index в колонку «Все». КБМ и ТМХ посчитаются по формуле ниже. Сейчас абонементы ещё не выложены — специально ничего не тянем.">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await adminPriceFormulas({ data: { token: token(), action: "crmStub" } });
                  setBusy(false);
                  setErr(res.ok ? "" : res.error || "CRM пока не отдаёт абонементы.");
                }}
              >
                Загрузить цены из CRM
              </Button>
            </TipWrap>
          </div>

          <div className="mt-8 flex flex-col rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">КБМ и ТМХ от колонки «Все»</p>
              <InfoTip text="Наценка суммой: 500 → корпоративная = публичная + 500 ₽ (минус — скидка). Умножение на процент: 90 → 90% от публичной, 100 → как есть, 110 → плюс 10%. Сначала сохраните формулу, потом «Пересчитать». Можно на все курсы или на одну школу." />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(["kbm", "tmx"] as const).map((who) => (
                <div key={who} className="rounded-2xl bg-surface-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">{who === "kbm" ? "КБМ" : "ТМХ"}</p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="text-sm">
                      Как считать
                      <select
                        value={formulas[who].mode}
                        onChange={(e) => setFormulas((f) => ({ ...f, [who]: { ...f[who], mode: e.target.value === "add" ? "add" : "percent" } }))}
                        className="mt-1 block h-11 rounded-xl bg-white px-3 ring-1 ring-black/10"
                      >
                        <option value="add">Наценка суммой, ₽</option>
                        <option value="percent">Умножить на процент</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      {formulas[who].mode === "add" ? "Сумма, ₽" : "Процент"}
                      <input
                        value={formulas[who].value}
                        inputMode="numeric"
                        onChange={(e) => setFormulas((f) => ({ ...f, [who]: { ...f[who], value: Number(e.target.value) || 0 } }))}
                        className="mt-1 block h-11 w-28 rounded-xl bg-white px-3 ring-1 ring-black/10"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <label className="mt-4 text-sm">
              Область
              <select
                value={corpDir}
                onChange={(e) => setCorpDir(e.target.value)}
                className="mt-1 block h-11 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
              >
                <option value="">Все курсы</option>
                {PRICE_DIRECTIONS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <AdminSaveBar>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await adminPriceFormulas({ data: { token: token(), action: "save", formulas } });
                  setBusy(false);
                  setErr(res.ok ? "" : res.error || "Ошибка");
                  if (res.ok) setErr("Формула сохранена.");
                }}
              >
                Сохранить формулу
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await adminPriceFormulas({ data: { token: token(), action: "apply", formulas, direction: corpDir || undefined } });
                  setBusy(false);
                  if (res.ok && "rows" in res && res.rows) {
                    setRows(res.rows);
                    hydratePrices(res.rows);
                    setErr("КБМ и ТМХ пересчитаны.");
                  } else setErr(res.ok ? "" : res.error || "Ошибка");
                }}
              >
                Пересчитать КБМ и ТМХ
              </Button>
            </AdminSaveBar>
          </div>

          <div className="mt-8 flex flex-col rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
            <p className="text-sm font-semibold">Группой</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Школа
                <select
                  className="mt-1 block h-11 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  value={dir}
                  onChange={(e) => setDir(e.target.value)}
                >
                  {PRICE_DIRECTIONS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Поле
                <select
                  className="mt-1 block h-11 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  value={field}
                  onChange={(e) => setField(e.target.value as typeof field)}
                >
                  <option value="all">Цена (все)</option>
                  <option value="kbm">КБМ</option>
                  <option value="tmx">ТМХ</option>
                  <option value="all-three">Все три</option>
                </select>
              </label>
              <label className="text-sm">
                Как
                <select
                  className="mt-1 block h-11 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="set">Поставить</option>
                  <option value="delta">Прибавить / убавить</option>
                </select>
              </label>
              <label className="text-sm">
                Сумма, ₽
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 block h-11 w-28 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                />
              </label>
            </div>
            <AdminSaveBar>
              <Button type="button" disabled={busy} onClick={() => void applyGroup()}>
                Применить к школе
              </Button>
            </AdminSaveBar>
          </div>

          <div className="mt-8 space-y-8">
            {grouped.map(([name, list]) => (
              <section key={name}>
                <h3 className="font-display text-xl">{name}</h3>
                <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-black/8">
                  <table className="w-full min-w-[52rem] table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[46%]" />
                      <col className="w-[13%]" />
                      <col className="w-[13%]" />
                      <col className="w-[13%]" />
                      <col className="w-[15%]" />
                    </colgroup>
                    <thead className="bg-surface-2 text-[0.72rem] uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Курс</th>
                        <th className="px-3 py-3 text-right font-semibold">Все</th>
                        <th className="px-3 py-3 text-right font-semibold">КБМ</th>
                        <th className="px-3 py-3 text-right font-semibold">ТМХ</th>
                        <th className="px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((row) => (
                        <tr key={row.path} className="border-t border-black/6">
                          <td className="px-4 py-3 align-middle">
                            <p className="font-medium leading-snug">{row.name}</p>
                            <p className="mt-0.5 text-xs text-muted">{row.age}</p>
                          </td>
                          {(["all", "kbm", "tmx"] as const).map((k) => (
                            <td key={k} className="px-3 py-3 align-middle">
                              <input
                                value={row[k]}
                                inputMode="numeric"
                                onChange={(e) => patch(row.path, k, e.target.value)}
                                className="h-10 w-full rounded-lg bg-surface-2 px-2 text-right tabular-nums ring-1 ring-black/10"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-3 align-middle text-right">
                            <button
                              type="button"
                              disabled={busy}
                              className="text-sm font-semibold text-primary"
                              onClick={() => void saveRow(row)}
                            >
                              Сохранить
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "schedule" ? <AdminSchedule /> : null}
      {tab === "calls" ? <AdminCalls /> : null}
      {tab === "dossiers" ? <AdminDossiers /> : null}
      {tab === "agent" ? <AdminAgent /> : null}
      {tab === "apis" ? <AdminIntegrations /> : null}
    </article>
  );
}
