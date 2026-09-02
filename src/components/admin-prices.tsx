"use client";

import { useEffect, useState } from "react";
import {
  adminLogin,
  adminCalls,
  adminMeta,
} from "@/data/admin";
import { Button } from "@/components/ui/button";
import { AdminCalls } from "@/components/admin-calls";
import { AdminAgent } from "@/components/admin-agent";
import { AdminDossiers } from "@/components/admin-dossiers";
import { AdminSchedule } from "@/components/admin-schedule";
import { AdminIntegrations } from "@/components/admin-integrations";
import { adminGhostBtn, AdminSelfTest } from "@/components/admin-self-test";
import { cn } from "@/lib/utils";

const KEY = "ra_admin";
type Tab = "schedule" | "agent" | "calls" | "dossiers" | "apis";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "schedule", label: "Расписание занятий", hint: "Группы, цены, абонементы" },
  { id: "agent", label: "Ассистент ИИ", hint: "Окно, обучение, разделы сайта" },
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
  if (!t) return;
  localStorage.setItem(KEY, t);
  const host = typeof location !== "undefined" ? location.hostname : "";
  const domain = host.endsWith("rastudio.org") ? "; domain=.rastudio.org" : "";
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `ra_admin=${encodeURIComponent(t)}; path=/; max-age=${7 * 24 * 3600}; samesite=lax${domain}${secure}`;
}

function logout() {
  localStorage.removeItem(KEY);
  document.cookie = "ra_admin=; path=/; max-age=0; samesite=lax";
}

export function AdminPrices() {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [in_, setIn] = useState(false);
  const [tab, setTab] = useState<Tab>("schedule");
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
  const [busy, setBusy] = useState(false);

  async function load(t = token()) {
    if (!t) return;
    setIn(true);
    try {
      const meta = await adminMeta({ data: { token: t } });
      if (meta.ok && "token" in meta && meta.token) persist(String(meta.token));
      if (!meta.ok && /вход/i.test(meta.error || "")) {
        const stored = localStorage.getItem(KEY) || "";
        if (stored && stored !== t) {
          persist(stored);
          const retry = await adminMeta({ data: { token: stored } });
          if (retry.ok) {
            if ("token" in retry && retry.token) persist(String(retry.token));
            setIn(true);
            setErr("");
          } else {
            setIn(false);
            setErr(retry.error || meta.error);
            return;
          }
        } else {
          setIn(false);
          setErr(meta.error);
          return;
        }
      }
      setErr("");
      const auth = token() || t;
      const calls = await adminCalls({ data: { token: auth, action: "status" } });
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
      const listed = await adminCalls({ data: { token: auth, action: "list" } });
      if (listed.ok && listed.transcripts) setTranscripts(listed.transcripts);
    } catch {
      setIn(Boolean(token() || t));
    }
  }

  useEffect(() => {
    if (token()) setIn(true);
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

      {tab === "schedule" ? <AdminSchedule /> : null}
      {tab === "calls" ? <AdminCalls /> : null}
      {tab === "dossiers" ? <AdminDossiers /> : null}
      {tab === "agent" ? <AdminAgent /> : null}
      {tab === "apis" ? <AdminIntegrations /> : null}
    </article>
  );
}
