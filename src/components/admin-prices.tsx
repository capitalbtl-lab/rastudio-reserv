"use client";

import { useEffect, useMemo, useState } from "react";
import { adminLogin, adminPrices, adminSaveGroup, adminSavePrice } from "@/data/admin";
import { PRICE_DIRECTIONS, hydratePrices, type PriceRow } from "@/data/prices-core";
import { Button } from "@/components/ui/button";

const KEY = "ra_admin";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem(KEY) || "";
}

function persist(t: string) {
  localStorage.setItem(KEY, t);
  document.cookie = `ra_admin=${encodeURIComponent(t)}; path=/; max-age=${7 * 24 * 3600}; samesite=lax`;
}

export function AdminPrices() {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [in_, setIn] = useState(false);
  const [dir, setDir] = useState(PRICE_DIRECTIONS[0]);
  const [field, setField] = useState<"all" | "kbm" | "tmx" | "all-three">("all");
  const [mode, setMode] = useState<"set" | "delta">("set");
  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);

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

  function patch(path: string, key: "all" | "kbm" | "tmx", value: string) {
    const n = Number(value.replace(/\s/g, ""));
    setRows((prev) => prev.map((r) => (r.path === path ? { ...r, [key]: Number.isFinite(n) ? n : 0 } : r)));
  }

  if (!in_) {
    return (
      <article className="page-wrap py-16">
        <p className="kicker">Только для администратора студии</p>
        <h1 className="display mt-3 text-4xl">Кабинет цен</h1>
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
      <p className="kicker">Кабинет администратора</p>
      <h1 className="display mt-3 text-4xl">Цены курсов</h1>
      <p className="mt-3 max-w-2xl text-muted">
        «Все» — цена на сайте. КБМ и ТМХ — внутренние. Можно править строку, всю школу сразу или сказать Олегу и Ольге: «подними цены художественной школы на 200».
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

      {err ? <p className="mt-4 text-sm text-primary">{err}</p> : null}

      <div className="mt-8 space-y-8">
        {grouped.map(([name, list]) => (
          <section key={name}>
            <h2 className="font-display text-xl">{name}</h2>
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
    </article>
  );
}
