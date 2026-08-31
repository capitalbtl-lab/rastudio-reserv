"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "@/data/admin";
import { fieldLabel } from "@/data/edits-core";
import { PRICE_DIRECTIONS, hydratePrices, type PriceRow } from "@/data/prices-core";
import { speakAgent } from "@/data/agent-voice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KEY = "ra_admin";
type Tab = "prices" | "voice" | "access" | "voices";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "prices", label: "Цены курсов", hint: "Прайс на сайте" },
  { id: "voice", label: "Изменение сайта голосом", hint: "Тексты" },
  { id: "voices", label: "Настройки голосов", hint: "Олег и Ольга" },
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
  const [voice, setVoice] = useState({ oleg: "zahar", olga: "alena", speed: 1.05, pause: 0.2, mood: "good", role: "good" });
  const [male, setMale] = useState<{ id: string; label: string }[]>([]);
  const [female, setFemale] = useState<{ id: string; label: string }[]>([]);
  const [roles, setRoles] = useState<{ id: string; label: string }[]>([]);
  const [savedVoice, setSavedVoice] = useState("");

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
      setVoice({
        oleg: vo.settings.oleg,
        olga: vo.settings.olga,
        speed: vo.settings.speed,
        pause: vo.settings.pause ?? 0.2,
        mood: vo.settings.mood || vo.settings.role || "good",
        role: vo.settings.role || "good",
      });
      setMale(vo.male);
      setFemale(vo.female);
      setRoles(vo.roles);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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

  async function listen(who: "oleg" | "olga") {
    setBusy(true);
    try {
      const sample =
        who === "olga"
          ? "Здравствуйте, я Ольга. Подберём курс, который подойдёт вашему ребёнку."
          : "Здравствуйте, я Олег. Расскажу про робототехнику и программирование.";
      const res = await speakAgent({
        data: {
          text: sample,
          who,
          preview: {
            oleg: voice.oleg,
            olga: voice.olga,
            speed: voice.speed,
            pause: voice.pause,
            mood: voice.mood || voice.role,
            role: voice.mood || voice.role,
          },
        },
      });
      if (res.ok && "audio" in res) {
        const el = new Audio(res.audio);
        el.volume = "volume" in res ? Number(res.volume) : 1;
        await el.play();
      } else setErr("Не удалось проиграть голос.");
    } catch {
      setErr("Не удалось проиграть голос.");
    }
    setBusy(false);
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
                  <table className="w-full min-w-[44rem] text-left text-sm">
                    <thead className="bg-surface-2 text-[0.72rem] uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Курс</th>
                        <th className="px-3 py-2 font-semibold">Все</th>
                        <th className="px-3 py-2 font-semibold">КБМ</th>
                        <th className="px-3 py-2 font-semibold">ТМХ</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((row) => (
                        <tr key={row.path} className="border-t border-black/6">
                          <td className="px-3 py-2">
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted">{row.age}</p>
                          </td>
                          {(["all", "kbm", "tmx"] as const).map((k) => (
                            <td key={k} className="px-3 py-2">
                              <input
                                value={row[k]}
                                onChange={(e) => patch(row.path, k, e.target.value)}
                                className="h-10 w-24 rounded-lg bg-surface-2 px-2 ring-1 ring-black/10"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2">
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
              Олег — только мужской, Ольга — только женский. Темп речи нормальный, пауза между словами регулируется отдельно. Прослушайте и сохраните.
            </p>
          </div>
          <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                Олег, мужской
                <select
                  className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  value={voice.oleg}
                  onChange={(e) => setVoice((v) => ({ ...v, oleg: e.target.value }))}
                >
                  {(male.length ? male : [{ id: "zahar", label: "Захар" }]).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="mt-2 text-sm font-semibold text-primary" onClick={() => void listen("oleg")}>
                  Слушать Олега
                </button>
              </label>
              <label className="text-sm">
                Ольга, женский
                <select
                  className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  value={voice.olga}
                  onChange={(e) => setVoice((v) => ({ ...v, olga: e.target.value }))}
                >
                  {(female.length ? female : [{ id: "alena", label: "Алёна" }]).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="mt-2 text-sm font-semibold text-primary" onClick={() => void listen("olga")}>
                  Слушать Ольгу
                </button>
              </label>
              <label className="text-sm">
                Интонация
                <select
                  className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                  value={voice.mood || voice.role}
                  onChange={(e) => setVoice((v) => ({ ...v, mood: e.target.value, role: e.target.value }))}
                >
                  {(roles.length ? roles : [{ id: "good", label: "Радостный, позитивный" }]).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Темп речи {voice.speed.toFixed(2)}
                <input
                  type="range"
                  min="0.9"
                  max="1.2"
                  step="0.01"
                  value={voice.speed}
                  onChange={(e) => setVoice((v) => ({ ...v, speed: Number(e.target.value) }))}
                  className="mt-3 block w-full"
                />
                <span className="text-xs text-muted">1.00 — обычная скорость слов</span>
              </label>
              <label className="text-sm md:col-span-2">
                Пауза между словами {Number(voice.pause ?? 0.2).toFixed(2)}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={voice.pause ?? 0.2}
                  onChange={(e) => setVoice((v) => ({ ...v, pause: Number(e.target.value) }))}
                  className="mt-3 block w-full"
                />
                <span className="text-xs text-muted">Левее — короче паузы, правее — спокойнее, с воздухом</span>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await adminSaveVoice({
                    data: { token: token(), oleg: voice.oleg, olga: voice.olga, speed: voice.speed, pause: voice.pause, mood: voice.mood || voice.role },
                  });
                  setBusy(false);
                  if (!res.ok) setErr(res.error);
                  else {
                    setVoice({ ...res.settings, mood: res.settings.mood || res.settings.role });
                    setSavedVoice("Голоса сохранены");
                  }
                }}
              >
                Сохранить голоса
              </Button>
              {savedVoice ? <p className="text-sm text-primary">{savedVoice}</p> : null}
            </div>
          </div>
        </section>
      ) : null}

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
