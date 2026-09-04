"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { adminGroupDurations, adminPrices, adminSaveAll, adminSaveGroup, adminAddPriceCourse, adminDeletePrice } from "@/data/admin";
import { PRICE_DIRECTIONS, formatMinsList, hydratePrices, listPriceRows, matchDuration, parseMinsList, type PriceRow } from "@/data/prices-core";
import { Button } from "@/components/ui/button";
import { AdminSectionHead } from "@/components/admin-self-test";
import { adminPriceFormulas, type CorpFormulas } from "@/data/price-formulas";
import { retryFetch } from "@/lib/retry-fetch";
import { pullFromCrm } from "@/lib/crm-pull";
import { CrmPullDialog, emptyPull, type CrmPullState } from "@/components/crm-pull-dialog";
import { InfoTip, TipWrap } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

const PRICE_COLS_KEY = "ra_price_cols";
function readPriceCols() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRICE_COLS_KEY) || "{}") as Record<string, number>;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function PriceColHandle({ onDown }: { onDown: (e: PointerEvent<HTMLSpanElement>) => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина столбца"
      title="Потяните, чтобы изменить ширину"
      className="absolute right-0 top-0 z-20 flex h-full w-3 cursor-col-resize touch-none items-center justify-center"
      onPointerDown={onDown}
    >
      <span className="pointer-events-none h-[1.4rem] w-px rounded-full bg-black/20 group-hover/col:bg-primary/70" />
    </span>
  );
}

export function AdminCoursePrices() {
  const [rows, setRows] = useState<PriceRow[]>(() => listPriceRows());
  const [dir, setDir] = useState(PRICE_DIRECTIONS[0]);
  const [field, setField] = useState("all");
  const [mode, setMode] = useState<"set" | "delta">("set");
  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [formulas, setFormulas] = useState<CorpFormulas>({ kbm: { mode: "percent", value: 100 }, tmx: { mode: "percent", value: 100 }, extra: [] });
  const [corpDir, setCorpDir] = useState("");
  const [formulasOpen, setFormulasOpen] = useState(false);
  const [pull, setPull] = useState<CrmPullState>(emptyPull("prices"));
  const [addName, setAddName] = useState("");
  const [schools, setSchools] = useState<{ id: string; label: string }[]>([]);
  const [newSchool, setNewSchool] = useState("");
  const [newCourseSchool, setNewCourseSchool] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [newAge, setNewAge] = useState("");
  const [editing, setEditing] = useState(false);
  const [colW, setColW] = useState<Record<string, number>>({});
  const colWRef = useRef(colW);
  colWRef.current = colW;

  async function load() {
    setBusy(true);
    try {
      const res = await retryFetch(() => adminPrices({ data: { token: token() } }));
      if (!res.ok) {
        setErr(res.error || "Не удалось загрузить цены.");
        return;
      }
      const next = Array.isArray(res.rows) ? res.rows : [];
      if (next.length) {
        setRows(next);
        hydratePrices(next);
      }
      if ("schools" in res && Array.isArray(res.schools) && res.schools.length) setSchools(res.schools);
      else if (next.length) setSchools([...new Set(next.map((r) => r.direction))].filter(Boolean).map((label) => ({ id: label, label })));
      setErr(next.length ? "" : "Файл цен пуст — показаны курсы с сайта.");
      const form = await adminPriceFormulas({ data: { token: token(), action: "get" } });
      if (form.ok && "formulas" in form && form.formulas) {
        setFormulas({ kbm: form.formulas.kbm, tmx: form.formulas.tmx, extra: form.formulas.extra || [] });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить цены.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setColW(readPriceCols());
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { id: string; label: string; list: PriceRow[] }>();
    for (const row of rows) {
      const sch = schools.find((s) => s.label === row.direction) || { id: row.direction, label: row.direction };
      const cur = map.get(sch.id) || { id: sch.id, label: sch.label, list: [] };
      cur.list.push(row);
      cur.label = sch.label;
      map.set(sch.id, cur);
    }
    return [...map.values()];
  }, [rows, schools]);

  async function saveAll() {
    setBusy(true);
    const res = await adminSaveAll({ data: { token: token(), rows, schools } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || "Не удалось сохранить.");
      return;
    }
    if ("rows" in res && Array.isArray(res.rows) && res.rows.length) {
      setRows(res.rows);
      hydratePrices(res.rows);
    }
    setErr("Лист цен сохранён.");
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

  function patch(path: string, key: string, value: string) {
    const n = Number(value.replace(/\s/g, ""));
    const num = Number.isFinite(n) ? n : 0;
    setRows((prev) =>
      prev.map((r) => {
        if ((r.courseId || r.path) !== path) return r;
        if (key === "name" || key === "age" || key === "direction") return { ...r, [key]: value };
        if (key === "mins") {
          const list = parseMinsList(value);
          return {
            ...r,
            minsList: list,
            mins: list[0] || 0,
            perWeek: list.length > 1 ? Math.max(r.perWeek || 0, list.length) : r.perWeek,
          };
        }
        if (key === "all" || key === "kbm" || key === "tmx" || key === "perWeek") return { ...r, [key]: num };
        return { ...r, extra: { ...(r.extra || {}), [key]: num } };
      }),
    );
  }

  function renameSchoolById(id: string, label: string) {
    const prev = schools.find((s) => s.id === id)?.label || id;
    setSchools((s) => s.map((x) => (x.id === id ? { ...x, label } : x)));
    setRows((r) => r.map((row) => (row.direction === prev ? { ...row, direction: label } : row)));
  }

  async function removeCourse(row: PriceRow) {
    const id = row.courseId || row.path || row.id;
    if (!id || !confirm(`Удалить курс «${row.name}» из прайса и из дерева групп?`)) return;
    setBusy(true);
    const res = await adminDeletePrice({ data: { token: token(), kind: "course", id } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || "Не удалось удалить курс.");
      return;
    }
    if ("rows" in res && res.rows) {
      setRows(res.rows);
      hydratePrices(res.rows);
    }
    if ("schools" in res && res.schools) setSchools(res.schools);
    setErr(`Курс «${row.name}» удалён.`);
  }

  async function removeSchool(label: string) {
    const school = schools.find((s) => s.label === label);
    if (!confirm(`Удалить школу «${label}» и все её курсы в прайсе и в группах?`)) return;
    setBusy(true);
    const res = await adminDeletePrice({ data: { token: token(), kind: "school", id: school?.id, label } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || "Не удалось удалить школу.");
      return;
    }
    if ("rows" in res && res.rows) {
      setRows(res.rows);
      hydratePrices(res.rows);
    }
    if ("schools" in res && res.schools) setSchools(res.schools);
    setErr(`Школа «${label}» удалена.`);
  }

  const extra = formulas.extra || [];
  const colPx = (key: string, fallback: number) => {
    const n = Number(colW[key]);
    return n > 0 ? n : fallback;
  };
  function resizeCol(key: string, min: number, e: PointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const startW = colPx(key, min);
    const prevUser = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const move = (ev: globalThis.PointerEvent) => {
      const next = Math.round(Math.min(640, Math.max(min, startW + ev.clientX - startX)));
      setColW((cur) => ({ ...cur, [key]: next }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.userSelect = prevUser;
      document.body.style.cursor = prevCursor;
      try {
        localStorage.setItem(PRICE_COLS_KEY, JSON.stringify(colWRef.current));
      } catch {
        /* */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function takePack(res: { ok: boolean; error?: string; formulas?: CorpFormulas; rows?: PriceRow[] }, okText: string) {
    if (!res.ok) {
      setErr(res.error || "Ошибка");
      return;
    }
    if (res.formulas) setFormulas({ kbm: res.formulas.kbm, tmx: res.formulas.tmx, extra: res.formulas.extra || [] });
    if (res.rows) {
      setRows(res.rows);
      hydratePrices(res.rows);
    }
    setErr(okText);
  }

  async function addClient() {
    const name = addName.trim();
    if (name.length < 2) {
      setErr("Название корп. клиента — минимум 2 символа.");
      return;
    }
    setBusy(true);
    const res = await adminPriceFormulas({ data: { token: token(), action: "add", name } });
    setBusy(false);
    takePack(res, `Клиент «${name}» добавлен. Колонка появилась у всех курсов.`);
    if (res.ok) setAddName("");
  }

  async function addSchool() {
    const label = newSchool.trim();
    if (label.length < 2) {
      setErr("Название школы — минимум 2 символа.");
      return;
    }
    setBusy(true);
    const res = await adminAddPriceCourse({ data: { token: token(), kind: "school", label } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || "Не удалось добавить школу.");
      return;
    }
    if ("schools" in res && res.schools) setSchools(res.schools);
    if ("rows" in res && res.rows) {
      setRows(res.rows);
      hydratePrices(res.rows);
    }
    const created = ("schools" in res ? res.schools : []).find((s) => s.label === label);
    if (created) setNewCourseSchool(created.id);
    setNewSchool("");
    setErr(`Школа «${label}» появилась здесь и в разделе «Группы». Добавьте курс.`);
  }

  async function addCourse() {
    const schoolId = newCourseSchool;
    const label = newCourse.trim();
    if (!schoolId) {
      setErr("Выберите школу — ту же, что в «Группах».");
      return;
    }
    if (label.length < 2) {
      setErr("Название курса — минимум 2 символа.");
      return;
    }
    setBusy(true);
    const res = await adminAddPriceCourse({ data: { token: token(), kind: "course", schoolId, label, age: newAge.trim() } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || "Не удалось добавить курс.");
      return;
    }
    if ("schools" in res && res.schools) setSchools(res.schools);
    if ("rows" in res && res.rows) {
      setRows(res.rows);
      hydratePrices(res.rows);
    }
    setNewCourse("");
    setNewAge("");
    setErr("Курс записан в дерево сайта (Группы) и в прайс. В абонементах его можно привязать по ID курса.");
  }

  async function pullFromGroups() {
    setBusy(true);
    try {
      const res = await adminGroupDurations({ data: { token: token() } });
      if (!res.ok || !("items" in res)) {
        setErr(res.ok ? "Группы пустые." : res.error || "Не удалось прочитать группы.");
        return;
      }
      const items = res.items || [];
      let filled = 0;
      const next = rows.map((r) => {
        const hit = matchDuration(r, items);
        if (!hit) return r;
        filled += 1;
        return { ...r, mins: hit.mins || 0, perWeek: hit.perWeek || 0, minsList: hit.minsList || (hit.mins ? [hit.mins] : []) };
      });
      setRows(next);
      setErr(
        filled
          ? `Из групп: ${filled} курсов, учтено ${res.used ?? "—"} из ${res.groups} групп. Проверьте минуты и «в неделю», затем «Сохранить».`
          : "В группах нет курсов, которые можно сопоставить с таблицей цен.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось подгрузить из групп.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 space-y-4">
      <AdminSectionHead section="prices" title="Цены курсов">
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
          Базовый прайс студии. Администратор заполняет его сам по текущим ценам. Колонка «Все» — цена на сайте, в расписании и в абонементах (по courseId курса). КБМ, ТМХ и другие клиенты считаются формулой от «Все». Минуты: одно занятие — «90», два одинаковых — «90 × 2», два разных — «90 + 180». «Подгрузить из групп» берёт длительности из расписания занятий недели.
        </p>
      </AdminSectionHead>
      {err ? <p className="text-sm text-primary">{err}</p> : null}
      <div className="sticky top-0 z-20 -mx-1 flex items-center gap-2 bg-[#f5f6f8]/95 px-1 py-2 backdrop-blur">
        <TipWrap text="Когда в AlfaCRM появятся абонементы в прайсе сайта, эта кнопка заберёт их в колонку «Все». КБМ и ТМХ посчитаются по формуле ниже.">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setPull({ ...emptyPull("prices"), open: true, step: "Считаю цены с абонементов…" });
              const st = await pullFromCrm("prices", (step, lines, done, total) => {
                setPull((u) => (u.done ? u : { ...u, step: step || u.step, lines, added: done, total }));
              });
              if (!st.ok) {
                setPull((u) => ({ ...u, done: true, error: st.error || "Не удалось обновить цены." }));
                return;
              }
              setPull({
                open: true,
                kind: "prices",
                step: "",
                done: true,
                error: String((st as { error?: string }).error || ""),
                lines: ((st as { lines?: { ok: boolean; text: string }[] }).lines || []) as { ok: boolean; text: string }[],
                added: 0,
                updated: Number((st as { updated?: number }).updated || 0),
                total: Number((st as { total?: number }).total || 0),
              });
              await load();
            }}
          >
            Загрузить цены из CRM
          </Button>
        </TipWrap>
        <TipWrap text="Возьмёт длительность урока и число занятий в неделю из вкладки «Группы». Жёсткой привязки нет: цифры можно править, пока снова не нажмёте кнопку. Чтобы записать на диск — «Сохранить».">
          <Button type="button" variant="secondary" className="h-10" disabled={busy} onClick={() => void pullFromGroups()}>
            Подгрузить из групп
          </Button>
        </TipWrap>
        <input
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addClient();
            }
          }}
          placeholder="Название корп. клиента"
          className="h-10 w-44 rounded-xl bg-white px-3 text-sm ring-1 ring-black/10"
        />
        <Button type="button" variant="secondary" className="h-10" disabled={busy} onClick={() => void addClient()}>
          Добавить корп.клиента
        </Button>
        <Button type="button" variant={editing ? "default" : "secondary"} className="ml-auto h-10 px-5" disabled={busy} onClick={() => setEditing((v) => !v)}>
          {editing ? "Готово" : "Редактировать"}
        </Button>
        <Button type="button" className="h-10 px-5" disabled={busy || !rows.length} onClick={() => void saveAll()}>
          Сохранить
        </Button>
      </div>

      {editing ? (
      <div className="flex flex-wrap items-end gap-2 rounded-[8px] bg-white p-3 ring-1 ring-black/8">
        <p className="w-full text-[0.72rem] font-semibold uppercase tracking-wider text-muted">Школа и курс — то же дерево, что у групп</p>
        <label className="text-[0.72rem] text-muted">
          Новая школа
          <input
            value={newSchool}
            onChange={(e) => setNewSchool(e.target.value)}
            placeholder="Танцевальная школа"
            className="mt-0.5 block h-9 w-52 rounded-[8px] bg-surface-2 px-2 text-sm ring-1 ring-black/10"
          />
        </label>
        <Button type="button" variant="secondary" className="h-9" disabled={busy} onClick={() => void addSchool()}>
          Добавить школу
        </Button>
        <span className="hidden h-9 w-px bg-black/10 sm:block" />
        <label className="text-[0.72rem] text-muted">
          Школа
          <select
            value={newCourseSchool}
            onChange={(e) => setNewCourseSchool(e.target.value)}
            className="mt-0.5 block h-9 min-w-[12rem] rounded-[8px] bg-surface-2 px-2 text-sm ring-1 ring-black/10"
          >
            <option value="">выберите</option>
            {(schools.length ? schools : [...new Set(rows.map((r) => r.direction))].map((label) => ({ id: label, label }))).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[0.72rem] text-muted">
          Курс
          <input
            value={newCourse}
            onChange={(e) => setNewCourse(e.target.value)}
            placeholder="Бальные танцы"
            className="mt-0.5 block h-9 w-48 rounded-[8px] bg-surface-2 px-2 text-sm ring-1 ring-black/10"
          />
        </label>
        <label className="text-[0.72rem] text-muted">
          Возраст
          <input
            value={newAge}
            onChange={(e) => setNewAge(e.target.value)}
            placeholder="5-6 лет"
            className="mt-0.5 block h-9 w-28 rounded-[8px] bg-surface-2 px-2 text-sm ring-1 ring-black/10"
          />
        </label>
        <Button type="button" variant="secondary" className="h-9" disabled={busy} onClick={() => void addCourse()}>
          Добавить курс
        </Button>
      </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-black/8">
        <button type="button" onClick={() => setFormulasOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
          <span className="text-sm font-semibold">Формула формирования цены</span>
          <InfoTip text="Продвинутый режим. Наценка суммой: 500 → корпоративная = «Все» + 500 ₽. Умножение: 90 → 90% от «Все». Сначала «Сохранить», потом «Пересчитать». Ниже — правка группой по школе." />
          <span className="ml-auto text-[0.72rem] font-semibold text-muted">{formulasOpen ? "Скрыть" : "Показать"}</span>
          <span className={cn("text-muted transition-transform", formulasOpen ? "rotate-180" : "")}>▾</span>
        </button>
        {formulasOpen ? (
          <div className="space-y-3 border-t border-black/6 px-4 pb-3 pt-3">
            <p className="text-[0.78rem] leading-relaxed text-muted">
              Продвинутый режим: как из колонки «Все» получаются цены КБМ, ТМХ и других клиентов, и правка группой по школе. Саму колонку «Все» администратор ставит вручную.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              {(["kbm", "tmx"] as const).map((who) => (
                <div key={who} className="flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 px-2.5 py-2">
                  <p className="mb-1 w-full text-[0.65rem] font-semibold uppercase tracking-wider text-muted">{who === "kbm" ? "КБМ" : "ТМХ"}</p>
                  <label className="text-[0.72rem] text-muted">
                    Как
                    <select
                      value={formulas[who].mode}
                      onChange={(e) => setFormulas((f) => ({ ...f, [who]: { ...f[who], mode: e.target.value === "add" ? "add" : "percent" } }))}
                      className="mt-0.5 block h-8 rounded-lg bg-white px-2 text-sm ring-1 ring-black/10"
                    >
                      <option value="add">Наценка, ₽</option>
                      <option value="percent">× процент</option>
                    </select>
                  </label>
                  <label className="text-[0.72rem] text-muted">
                    {formulas[who].mode === "add" ? "₽" : "%"}
                    <input
                      value={formulas[who].value}
                      inputMode="numeric"
                      onChange={(e) => setFormulas((f) => ({ ...f, [who]: { ...f[who], value: Number(e.target.value) || 0 } }))}
                      className="mt-0.5 block h-8 w-16 rounded-lg bg-white px-2 text-sm ring-1 ring-black/10"
                    />
                  </label>
                </div>
              ))}
              {extra.map((c, i) => (
                <div key={c.id} className="flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 px-2.5 py-2">
                  <div className="mb-1 flex w-full items-center gap-2">
                    <input
                      value={c.name}
                      onChange={(e) =>
                        setFormulas((f) => ({
                          ...f,
                          extra: f.extra.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                        }))
                      }
                      className="h-7 min-w-0 flex-1 rounded-lg bg-white px-2 text-[0.72rem] font-semibold uppercase tracking-wider ring-1 ring-black/10"
                    />
                    <button type="button" className="text-[0.7rem] font-semibold text-muted hover:text-primary" onClick={() => void removeClient(c.id, c.name)}>
                      Удалить
                    </button>
                  </div>
                  <label className="text-[0.72rem] text-muted">
                    Как
                    <select
                      value={c.mode}
                      onChange={(e) =>
                        setFormulas((f) => ({
                          ...f,
                          extra: f.extra.map((x, j) => (j === i ? { ...x, mode: e.target.value === "add" ? "add" : "percent" } : x)),
                        }))
                      }
                      className="mt-0.5 block h-8 rounded-lg bg-white px-2 text-sm ring-1 ring-black/10"
                    >
                      <option value="add">Наценка, ₽</option>
                      <option value="percent">× процент</option>
                    </select>
                  </label>
                  <label className="text-[0.72rem] text-muted">
                    {c.mode === "add" ? "₽" : "%"}
                    <input
                      value={c.value}
                      inputMode="numeric"
                      onChange={(e) =>
                        setFormulas((f) => ({
                          ...f,
                          extra: f.extra.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) || 0 } : x)),
                        }))
                      }
                      className="mt-0.5 block h-8 w-16 rounded-lg bg-white px-2 text-sm ring-1 ring-black/10"
                    />
                  </label>
                </div>
              ))}
              <label className="text-[0.72rem] text-muted">
                Область
                <select value={corpDir} onChange={(e) => setCorpDir(e.target.value)} className="mt-0.5 block h-8 rounded-lg bg-surface-2 px-2 text-sm ring-1 ring-black/10">
                  <option value="">Все курсы</option>
                  {PRICE_DIRECTIONS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const res = await adminPriceFormulas({ data: { token: token(), action: "save", formulas } });
                    setBusy(false);
                    setErr(res.ok ? "Формула сохранена." : res.error || "Ошибка");
                  }}
                >
                  Сохранить
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const res = await adminPriceFormulas({ data: { token: token(), action: "apply", formulas, direction: corpDir || undefined } });
                    setBusy(false);
                    if (res.ok && "rows" in res && res.rows) {
                      setRows(res.rows);
                      hydratePrices(res.rows);
                      setErr("Корпоративные цены пересчитаны.");
                    } else setErr(res.ok ? "" : res.error || "Ошибка");
                  }}
                >
                  Пересчитать
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-black/6 pt-3">
              <p className="mb-1 w-full text-[0.65rem] font-semibold uppercase tracking-wider text-muted">Группой</p>
              <label className="text-[0.72rem] text-muted">
                Школа
                <select className="mt-0.5 block h-8 rounded-lg bg-surface-2 px-2 text-sm ring-1 ring-black/10" value={dir} onChange={(e) => setDir(e.target.value)}>
                  {[...new Set([...PRICE_DIRECTIONS, ...rows.map((r) => r.direction), ...schools.map((s) => s.label)])].filter(Boolean).map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="text-[0.72rem] text-muted">
                Поле
                <select className="mt-0.5 block h-8 rounded-lg bg-surface-2 px-2 text-sm ring-1 ring-black/10" value={field} onChange={(e) => setField(e.target.value as typeof field)}>
                  <option value="all">Цена (все)</option>
                  <option value="kbm">КБМ</option>
                  <option value="tmx">ТМХ</option>
                  {extra.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="all-three">Все + КБМ + ТМХ</option>
                </select>
              </label>
              <label className="text-[0.72rem] text-muted">
                Как
                <select className="mt-0.5 block h-8 rounded-lg bg-surface-2 px-2 text-sm ring-1 ring-black/10" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                  <option value="set">Поставить</option>
                  <option value="delta">Прибавить / убавить</option>
                </select>
              </label>
              <label className="text-[0.72rem] text-muted">
                Сумма, ₽
                <input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-0.5 block h-8 w-20 rounded-lg bg-surface-2 px-2 text-sm ring-1 ring-black/10" />
              </label>
              <Button type="button" size="sm" className="ml-auto h-8" disabled={busy} onClick={() => void applyGroup()}>
                Применить к школе
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-8">
        {!grouped.length ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-sm text-muted ring-1 ring-black/8">
            {busy ? "Загружаю цены…" : "Таблица пуста. Обновите страницу или нажмите «Загрузить цены из CRM»."}
          </p>
        ) : null}
        {grouped.map((g) => (
          <section key={g.id}>
            <div className="flex flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <input
                    value={g.label}
                    onChange={(e) => renameSchoolById(g.id, e.target.value)}
                    className="min-w-[12rem] flex-1 rounded-[8px] bg-white px-2 font-display text-xl text-fg ring-1 ring-black/10"
                    title="Название школы"
                  />
                  <button
                    type="button"
                    className="rounded-[8px] px-2 py-1 text-[0.72rem] font-semibold text-muted hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => void removeSchool(g.label)}
                  >
                    Удалить школу
                  </button>
                </>
              ) : (
                <h3 className="font-display text-xl">{g.label}</h3>
              )}
            </div>
            <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-black/8">
              <table className="w-full min-w-[48rem] table-fixed text-left text-sm">
                <thead className="bg-surface-2 text-[0.72rem] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="group/col relative px-4 py-3 font-semibold" style={{ width: colPx("course", 280) }}>
                      Курс
                      <PriceColHandle onDown={(e) => resizeCol("course", 140, e)} />
                    </th>
                    <th className="group/col relative px-2 py-3 text-center font-semibold" style={{ width: colPx("mins", 110) }}>
                      Минут
                      <PriceColHandle onDown={(e) => resizeCol("mins", 72, e)} />
                    </th>
                    <th className="group/col relative px-2 py-3 text-center font-semibold" style={{ width: colPx("week", 96) }}>
                      В неделю
                      <PriceColHandle onDown={(e) => resizeCol("week", 64, e)} />
                    </th>
                    <th className="group/col relative px-2 py-3 text-center font-semibold" style={{ width: colPx("all", 96) }}>
                      Все
                      <PriceColHandle onDown={(e) => resizeCol("all", 64, e)} />
                    </th>
                    <th className="group/col relative px-2 py-3 text-center font-semibold" style={{ width: colPx("kbm", 96) }}>
                      КБМ
                      <PriceColHandle onDown={(e) => resizeCol("kbm", 64, e)} />
                    </th>
                    <th className="group/col relative px-2 py-3 text-center font-semibold" style={{ width: colPx("tmx", 96) }}>
                      ТМХ
                      <PriceColHandle onDown={(e) => resizeCol("tmx", 64, e)} />
                    </th>
                    {extra.map((c) => (
                      <th key={c.id} className="group/col relative px-2 py-3 text-center font-semibold" style={{ width: colPx(`x${c.id}`, 112) }}>
                        <span className="flex items-center justify-center gap-1">
                          <span className="truncate" title={c.name}>
                            {c.name}
                          </span>
                          <button
                            type="button"
                            className="rounded-full px-1 text-[0.7rem] font-semibold text-muted hover:text-primary"
                            title={`Убрать ${c.name}`}
                            onClick={() => void removeClient(c.id, c.name)}
                          >
                            ×
                          </button>
                        </span>
                        <PriceColHandle onDown={(e) => resizeCol(`x${c.id}`, 72, e)} />
                      </th>
                    ))}
                    {editing ? <th className="w-10 px-2 py-3" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {g.list.map((row) => (
                    <tr key={row.courseId || row.path || row.id} className="border-t border-black/6">
                      <td className="px-4 py-3 align-middle">
                        {editing ? (
                          <>
                            <input
                              value={row.name}
                              onChange={(e) => patch(row.courseId || row.path, "name", e.target.value)}
                              className="h-8 w-full rounded-[8px] bg-surface-2 px-2 text-sm font-medium ring-1 ring-black/10"
                              placeholder="Название курса"
                            />
                            <input
                              value={row.age || ""}
                              placeholder="Курс для детей от 14 лет"
                              onChange={(e) => patch(row.courseId || row.path, "age", e.target.value)}
                              className="mt-1 h-7 w-full rounded-[8px] bg-surface-2 px-2 text-xs text-muted ring-1 ring-black/10"
                            />
                          </>
                        ) : (
                          <>
                            <p className="font-medium leading-snug">{row.name}</p>
                            {row.age ? <p className="mt-0.5 text-xs text-muted">{row.age}</p> : null}
                          </>
                        )}
                      </td>
                      {(["mins", "perWeek", "all", "kbm", "tmx"] as const).map((k) => (
                        <td key={k} className="px-2 py-3 align-middle">
                          <input
                            value={k === "mins" ? formatMinsList(row.minsList, row.mins) : row[k] || ""}
                            inputMode={k === "mins" ? "text" : "numeric"}
                            placeholder="—"
                            title={k === "mins" ? "Одно занятие: 90. Два разных: 90 + 180. Два одинаковых: 90 × 2" : undefined}
                            onChange={(e) => patch(row.courseId || row.path, k, e.target.value)}
                            className={cn(
                              "mx-auto block h-10 rounded-lg bg-surface-2 px-2 text-center tabular-nums ring-1 ring-black/10",
                              k === "mins" ? "w-[6.5rem] text-[0.8rem]" : "w-[4.75rem]",
                            )}
                          />
                        </td>
                      ))}
                      {extra.map((c) => (
                        <td key={c.id} className="px-2 py-3 align-middle">
                          <input
                            value={row.extra?.[c.id] || ""}
                            inputMode="numeric"
                            placeholder="—"
                            onChange={(e) => patch(row.courseId || row.path, c.id, e.target.value)}
                            className="mx-auto block h-10 w-[4.75rem] rounded-lg bg-surface-2 px-2 text-center tabular-nums ring-1 ring-black/10"
                          />
                        </td>
                      ))}
                      {editing ? (
                      <td className="px-1 py-3 align-middle">
                        <button
                          type="button"
                          className="rounded-[8px] px-2 py-1 text-[0.72rem] font-semibold text-muted hover:bg-rose-50 hover:text-rose-700"
                          title="Удалить курс"
                          onClick={() => void removeCourse(row)}
                        >
                          ×
                        </button>
                      </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <CrmPullDialog pull={pull} onClose={() => setPull((u) => ({ ...u, open: false }))} />
    </section>
  );
}
