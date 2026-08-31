"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  adminClearEdit,
  adminEdits,
  adminLogin,
  adminMeta,
  adminPrices,
  adminSaveGroup,
  adminSavePrice,
  adminSaveVoice,
  adminSetCodeword,
  adminSetPassword,
  adminVoice,
  adminCalls,
} from "@/data/admin";
import { fieldLabel } from "@/data/edits-core";
import { PRICE_DIRECTIONS, hydratePrices, type PriceRow } from "@/data/prices-core";
import { speakAgent } from "@/data/agent-voice";
import { DEFAULT_VOICE, type VoiceSettings } from "@/data/voices-core";
import { Button } from "@/components/ui/button";
import { AdminCalls } from "@/components/admin-calls";
import { AdminChats } from "@/components/admin-chats";
import { AdminAgent } from "@/components/admin-agent";
import { AdminTrain } from "@/components/admin-train";
import { AdminDossiers } from "@/components/admin-dossiers";
import { cn } from "@/lib/utils";

const KEY = "ra_admin";
type Tab = "prices" | "voice" | "access" | "voices" | "calls" | "chats" | "agent" | "train" | "dossiers";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "prices", label: "Цены курсов", hint: "Прайс на сайте" },
  { id: "voice", label: "Изменение сайта голосом", hint: "Тексты" },
  { id: "voices", label: "Настройки голосов", hint: "Олег и Ольга" },
  { id: "agent", label: "Ассистент ИИ", hint: "Как ведёт диалог" },
  { id: "train", label: "Обучение", hint: "Примеры и экспорт" },
  { id: "calls", label: "База звонков", hint: "Novofon → знания" },
  { id: "dossiers", label: "Личные дела", hint: "Клиенты AlfaCRM" },
  { id: "chats", label: "Диалоги сайта", hint: "Олег и Ольга" },
  { id: "access", label: "Голосовой доступ", hint: "Кодовое слово" },
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
  const [word, setWord] = useState("");
  const [newPass, setNewPass] = useState("");
  const [log, setLog] = useState<{ at: string; text: string }[]>([]);
  const [savedWord, setSavedWord] = useState("");
  const [edits, setEdits] = useState<{ path: string; fields: Record<string, string> }[]>([]);
  const [voice, setVoice] = useState<VoiceSettings>({ ...DEFAULT_VOICE });
  const [male, setMale] = useState<{ id: string; label: string }[]>([]);
  const [female, setFemale] = useState<{ id: string; label: string }[]>([]);
  const [roles, setRoles] = useState<{ id: string; label: string }[]>([]);
  const [savedVoice, setSavedVoice] = useState("");
  const [playing, setPlaying] = useState("");
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
  const previewRef = useRef<HTMLAudioElement | null>(null);

  function stopPreview() {
    const el = previewRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
    }
    setPlaying("");
  }

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
    const meta = await adminMeta({ data: { token: t } });
    if (meta.ok) setLog(meta.log || []);
    const ed = await adminEdits({ data: { token: t } });
    if (ed.ok) setEdits(ed.edits || []);
    const vo = await adminVoice({ data: { token: t } });
    if (vo.ok) {
      setVoice({ ...DEFAULT_VOICE, ...vo.settings });
      setMale(vo.male);
      setFemale(vo.female);
      setRoles(vo.roles);
    }
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

  async function listen(who: "oleg" | "olga" | "both") {
    stopPreview();
    const el = previewRef.current || new Audio();
    previewRef.current = el;
    el.muted = false;
    el.volume = 1;
    const people = who === "both" ? (["oleg", "olga"] as const) : [who];
    setPlaying(who === "both" ? "Олег и Ольга" : who === "olga" ? "Ольга" : "Олег");
    try {
      for (const person of people) {
        const sample =
          person === "olga"
            ? voice.sampleOlga || DEFAULT_VOICE.sampleOlga
            : voice.sampleOleg || DEFAULT_VOICE.sampleOleg;
        const res = await speakAgent({
          data: {
            text: sample,
            who: person,
            preview: voice,
          },
        });
        if (!res.ok || !("audio" in res)) {
          setErr("Не удалось проиграть голос. Проверьте баланс Yandex SpeechKit.");
          setPlaying("");
          return;
        }
        await new Promise<void>((resolve, reject) => {
          el.onended = () => resolve();
          el.onerror = () => reject(new Error("audio"));
          el.playbackRate = 1;
          el.volume = "volume" in res ? Number(res.volume) : 1;
          el.src = res.audio;
          const play = el.play();
          if (play && typeof play.catch === "function") play.catch(() => reject(new Error("play")));
        });
        if (who === "both") await new Promise((r) => setTimeout(r, 80 + (voice.turnGap || 0) * 1000));
      }
    } catch {
      setErr("Браузер не дал включить звук. Нажмите «Прослушать» ещё раз.");
    }
    setPlaying("");
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Кабинет администратора</p>
          <h1 className="display mt-3 text-4xl">Кабинет администратора</h1>
        </div>
        <button
          type="button"
          className="text-sm font-semibold text-muted hover:text-fg"
          onClick={() => {
            logout();
            setIn(false);
          }}
        >
          Выйти
        </button>
      </div>

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
          <h2 className="font-display text-3xl">Цены курсов</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Колонка «все» показывается на сайте. Можно править строку или всю школу сразу.
          </p>

          <div className="mt-8 rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
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
              <Button type="button" disabled={busy} onClick={() => void applyGroup()}>
                Применить к школе
              </Button>
            </div>
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

      {tab === "voice" ? (
        <section className="mt-10 space-y-6">
          <div>
            <h2 className="font-display text-3xl">Изменение сайта голосом</h2>
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
                        <button
                          type="button"
                          className="shrink-0 text-xs font-semibold text-primary"
                          onClick={async () => {
                            setBusy(true);
                            await adminClearEdit({ data: { token: token(), path: item.path, field: key } });
                            await load();
                            setBusy(false);
                          }}
                        >
                          Вернуть
                        </button>
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Пока нет правок текстов — на сайте исходные формулировки.</p>
            )}
          </div>
        </section>
      ) : null}

      {tab === "voices" ? (
        <section className="mt-10 space-y-6">
          <div>
            <h2 className="font-display text-3xl">Настройки голосов</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              У Олега и Ольги свои тембр, интонация, темп и громкость. Двигайте ползунки и сразу слушайте — сохранять не обязательно, пока не решите.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {(
              [
                {
                  who: "oleg" as const,
                  title: "Олег",
                  sub: "Мужской голос, техника и инженерия",
                  voiceKey: "oleg" as const,
                  speedKey: "olegSpeed" as const,
                  moodKey: "olegMood" as const,
                  volumeKey: "olegVolume" as const,
                  sampleKey: "sampleOleg" as const,
                  options: male.length ? male : [{ id: "zahar", label: "Захар" }],
                },
                {
                  who: "olga" as const,
                  title: "Ольга",
                  sub: "Женский голос, запись и творчество",
                  voiceKey: "olga" as const,
                  speedKey: "olgaSpeed" as const,
                  moodKey: "olgaMood" as const,
                  volumeKey: "olgaVolume" as const,
                  sampleKey: "sampleOlga" as const,
                  options: female.length ? female : [{ id: "alena", label: "Алёна" }],
                },
              ]
            ).map((card) => (
              <div key={card.who} className="rounded-[1.8rem] bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl">{card.title}</p>
                    <p className="mt-1 text-sm text-muted">{card.sub}</p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => void listen(card.who)}>
                    Слушать
                  </Button>
                </div>
                <label className="mt-5 block text-sm">
                  Тембр
                  <select
                    className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                    value={voice[card.voiceKey]}
                    onChange={(e) => setVoice((v) => ({ ...v, [card.voiceKey]: e.target.value }))}
                  >
                    {card.options.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-sm">
                  Интонация
                  <select
                    className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                    value={voice[card.moodKey]}
                    onChange={(e) => setVoice((v) => ({ ...v, [card.moodKey]: e.target.value }))}
                  >
                    {(roles.length ? roles : [{ id: "good", label: "Радостный" }]).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-sm">
                  Темп {Number(voice[card.speedKey]).toFixed(2)}
                  <input
                    type="range"
                    min="0.9"
                    max="1.4"
                    step="0.01"
                    value={voice[card.speedKey]}
                    onChange={(e) => setVoice((v) => ({ ...v, [card.speedKey]: Number(e.target.value) }))}
                    className="mt-3 block w-full"
                  />
                  <span className="text-xs text-muted">0.9 медленнее · 1.16 живо · 1.4 быстрее</span>
                </label>
                <label className="mt-4 block text-sm">
                  Громкость {Math.round(Number(voice[card.volumeKey]) * 100)}%
                  <input
                    type="range"
                    min="0.45"
                    max="1"
                    step="0.05"
                    value={voice[card.volumeKey]}
                    onChange={(e) => setVoice((v) => ({ ...v, [card.volumeKey]: Number(e.target.value) }))}
                    className="mt-3 block w-full"
                  />
                </label>
                <label className="mt-4 block text-sm">
                  Фраза для прослушивания
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-black/10"
                    value={voice[card.sampleKey]}
                    onChange={(e) => setVoice((v) => ({ ...v, [card.sampleKey]: e.target.value }))}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="rounded-[1.8rem] bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <p className="font-display text-xl">Как они говорят вместе</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                Пауза внутри фразы {Number(voice.pause).toFixed(2)}
                <input
                  type="range"
                  min="0"
                  max="0.4"
                  step="0.02"
                  value={voice.pause}
                  onChange={(e) => setVoice((v) => ({ ...v, pause: Number(e.target.value) }))}
                  className="mt-3 block w-full"
                />
                <span className="text-xs text-muted">Левее — слова ближе, речь плотнее</span>
              </label>
              <label className="text-sm">
                Пауза между Олегом и Ольгой {Number(voice.turnGap).toFixed(2)} с
                <input
                  type="range"
                  min="0"
                  max="0.7"
                  step="0.02"
                  value={voice.turnGap}
                  onChange={(e) => setVoice((v) => ({ ...v, turnGap: Number(e.target.value) }))}
                  className="mt-3 block w-full"
                />
                <span className="text-xs text-muted">Сколько тишины между их репликами вдвоём</span>
              </label>
            </div>
            {playing ? <p className="mt-4 text-sm font-semibold text-primary">Играет: {playing}</p> : null}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => void listen("both")}>
                Прослушать обоих
              </Button>
              {playing ? (
                <Button type="button" variant="secondary" onClick={stopPreview}>
                  Стоп
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await adminSaveVoice({
                    data: { token: token(), ...voice },
                  });
                  setBusy(false);
                  if (!res.ok) setErr(res.error);
                  else {
                    setVoice({ ...DEFAULT_VOICE, ...res.settings });
                    setSavedVoice("Голоса сохранены");
                  }
                }}
              >
                Сохранить
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setVoice({ ...DEFAULT_VOICE });
                  setSavedVoice("Сброшено к заводским. Нажмите «Сохранить», чтобы применить.");
                }}
              >
                Сбросить
              </Button>
              {savedVoice ? <p className="text-sm text-primary">{savedVoice}</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "calls" ? <AdminCalls /> : null}
      {tab === "dossiers" ? <AdminDossiers /> : null}
      {tab === "chats" ? <AdminChats /> : null}
      {tab === "agent" ? <AdminAgent /> : null}
      {tab === "train" ? <AdminTrain /> : null}

      {tab === "access" ? (
        <section className="mt-10 space-y-6">
          <div>
            <h2 className="font-display text-3xl">Голосовой доступ</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Кодовое слово открывает правки на 30 минут. Голоса настраиваются в разделе «Настройки голосов».
            </p>
          </div>

          <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <p className="text-sm font-semibold">Кодовое слово</p>
            <p className="mt-1 text-sm text-muted">
              Ольга спросит его, когда попросите изменить сайт. Слово в чат не произносится. Минимум 4 буквы.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Новое кодовое слово
                <input
                  type="password"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  className="mt-1 block h-11 w-56 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                />
              </label>
              <Button
                type="button"
                disabled={busy || word.trim().length < 4}
                onClick={async () => {
                  setBusy(true);
                  const res = await adminSetCodeword({ data: { token: token(), word } });
                  setBusy(false);
                  if (!res.ok) setErr(res.error);
                  else {
                    setSavedWord("Слово обновлено");
                    setWord("");
                    await load();
                  }
                }}
              >
                Сохранить слово
              </Button>
              {savedWord ? <p className="text-sm text-primary">{savedWord}</p> : null}
            </div>
          </div>

          <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <p className="text-sm font-semibold">Пароль кабинета</p>
            <p className="mt-1 text-sm text-muted">Им входите на эту страницу. Минимум 6 символов.</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Новый пароль кабинета
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="mt-1 block h-11 w-56 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                />
              </label>
              <Button
                type="button"
                disabled={busy || newPass.trim().length < 6}
                onClick={async () => {
                  setBusy(true);
                  const res = await adminSetPassword({ data: { token: token(), password: newPass } });
                  setBusy(false);
                  if (!res.ok) setErr(res.error);
                  else {
                    setSavedWord("Пароль кабинета обновлён");
                    setNewPass("");
                  }
                }}
              >
                Сохранить пароль
              </Button>
            </div>
          </div>

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
        </section>
      ) : null}
    </article>
  );
}
