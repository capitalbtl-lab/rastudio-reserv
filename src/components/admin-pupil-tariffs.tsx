"use client";

import { useEffect, useMemo, useState } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { retryFetch } from "@/lib/retry-fetch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tariffMatchesSubject, ASSIGN_CHUNK, ASSIGN_BATCH_PAUSE_MS, assignEtaMin } from "@/data/pupil-tariffs";
import { ISO_DATE_MAX, ISO_DATE_MIN, clampIsoDate } from "@/data/admin-ui";

type PupilGroup = {
  key: string;
  groupId: number;
  branchId: number;
  name: string;
  school: string;
  course: string;
  age: string;
  teacher: string;
  taken: number;
  limit: number;
  subjectId: number;
};

type PupilTariffItem = {
  customerId: number;
  name: string;
  status: string;
  groupId: number;
  branchId: number;
  groupName: string;
  school: string;
  tariffId: number;
  tariffName: string;
  price: number;
  periodCount: number;
  periodType: number;
  calcType: number;
  subjectIds: number[];
  lessonTypeIds: number[];
  lessonsCount: number;
  eDate?: string;
  skip?: "no-tariff" | "already" | "lead";
  activeTariffs?: { id: number; tariffId: number; name: string }[];
};

function friendlyErr(e: unknown, fallback: string) {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (/groupKeys|invalid input|invalid_type/i.test(raw)) {
    return fallback;
  }
  return raw.trim() || fallback;
}

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function money(n: number) {
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addPeriod(iso: string, count: number, type: number) {
  if (!iso || !count) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  if (type === 1) d.setDate(d.getDate() + count);
  else if (type === 2) d.setDate(d.getDate() + count * 7);
  else if (type === 3) d.setMonth(d.getMonth() + count);
  else if (type === 4) d.setFullYear(d.getFullYear() + count);
  else return "";
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function periodWord(n: number, u: { one: string; few: string; many: string }) {
  const abs = Math.abs(Number(n) || 0) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return u.many;
  if (d === 1) return u.one;
  if (d >= 2 && d <= 4) return u.few;
  return u.many;
}

const PERIOD_HINTS = [
  { id: 1, one: "день", few: "дня", many: "дней" },
  { id: 2, one: "неделя", few: "недели", many: "недель" },
  { id: 3, one: "месяц", few: "месяца", many: "месяцев" },
  { id: 4, one: "год", few: "года", many: "лет" },
];

type TariffOpt = {
  id: number;
  name: string;
  price: number;
  subjectIds?: number[];
  lessonTypeIds?: number[];
  periodCount?: number;
  periodType?: number;
  calculationType?: number;
  lessonsCount?: number;
};

type GroupTariff = { tariffId: number; tariffName: string; options: TariffOpt[] };

export function PupilTariffWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [groups, setGroups] = useState<PupilGroup[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [school, setSchool] = useState("");
  const [unbound, setUnbound] = useState(0);
  const [branch, setBranch] = useState(0);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [includeLeads, setIncludeLeads] = useState(true);
  const [items, setItems] = useState<PupilTariffItem[]>([]);
  const [byGroup, setByGroup] = useState<Record<string, GroupTariff>>({});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(todayIso);
  const [periodCount, setPeriodCount] = useState(0);
  const [periodType, setPeriodType] = useState(3);
  const [dateTo, setDateTo] = useState("");
  const [calcType, setCalcType] = useState(1);
  const [skipExisting, setSkipExisting] = useState(true);
  const [job, setJob] = useState<"assign" | "close" | "delete">("assign");
  const [path, setPath] = useState<"add" | "change" | "remove">("add");
  const [closeDate, setCloseDate] = useState(todayIso);
  const [result, setResult] = useState<{ done: number; skipped: number; failed: { name: string; error: string }[] } | null>(null);
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [subjectOf, setSubjectOf] = useState<Record<string, number>>({});

  useEffect(() => {
    void (async () => {
      setBusy(true);
      try {
        const [res, sub] = await Promise.all([
          retryFetch(
            () => adminSchedule({ data: { token: token(), action: "pupilTariffGroups", groupKeys: [] } as never }),
            2,
            60000,
          ) as Promise<{ ok?: boolean; groups?: PupilGroup[]; schools?: string[]; unbound?: number; error?: string }>,
          retryFetch(
            () => adminSchedule({ data: { token: token(), action: "subjectsGet" } as never }),
            1,
            15000,
          ).catch(() => null) as Promise<{ ok?: boolean; subjects?: { id: number; name: string }[] } | null>,
        ]);
        if (res.ok) {
          setGroups(res.groups || []);
          setSchools(res.schools || []);
          setUnbound(Number(res.unbound || 0));
        } else setMsg(res.error || "Не удалось прочитать группы.");
        if (sub && "subjects" in sub && Array.isArray(sub.subjects)) setSubjects(sub.subjects);
      } catch (e) {
        setMsg(e instanceof Error ? friendlyErr(e, "Не удалось прочитать группы. Обновите страницу.") : "Не удалось прочитать группы.");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (school && g.school !== school) return false;
      if (branch && g.branchId !== branch) return false;
      if (!needle) return true;
      return `${g.name} ${g.course} ${g.school} ${g.teacher} ${g.age}`.toLowerCase().includes(needle);
    });
  }, [groups, school, branch, q]);

  const pupilKey = (it: PupilTariffItem) => `${it.branchId}:${it.groupId}:${it.customerId}`;

  async function loadPlan() {
    setBusy(true);
    setMsg(path === "add" ? "Читаю состав групп и подбираю абонементы…" : "Читаю активные абонементы в CRM…");
    try {
      const res = (await retryFetch(
        () =>
          adminSchedule({
            data: {
              token: token(),
              action: "pupilTariffPlan",
              includeLeads,
              onlyActive: path !== "add",
              groupKeys: [...picked]
                .map((k) => {
                  const [branchId, groupId] = k.split(":").map(Number);
                  return { branchId, groupId };
                })
                .filter((k) => Number(k.branchId) && Number(k.groupId)),
            } as never,
          }),
        1,
        path === "add" ? 180000 : 360000,
      )) as { ok?: boolean; items?: PupilTariffItem[]; byGroup?: Record<string, GroupTariff>; error?: string };
      if (!res.ok) {
        setMsg(res.error || "Не удалось собрать список учеников.");
        return false;
      }
      const rows = res.items || [];
      setItems(rows);
      setByGroup(res.byGroup || {});
      setChosen(new Set(path === "add" ? rows.filter((r) => r.tariffId && r.status === "учится").map(pupilKey) : rows.map(pupilKey)));
      setSubjectOf(Object.fromEntries(groups.filter((g) => picked.has(g.key)).map((g) => [g.key, g.subjectId || 0])));
      const sample = rows.find((r) => r.tariffId);
      if (sample) {
        const count = Number(sample.periodCount) || 0;
        const unit = Number(sample.periodType) || 3;
        setPeriodCount(count);
        setPeriodType(unit);
        setCalcType(Number(sample.calcType) || 0);
        setDateTo(addPeriod(date, count, unit));
      }
      setMsg("");
      return true;
    } catch (e) {
      setMsg(e instanceof Error ? friendlyErr(e, "Не удалось собрать список учеников. Отметьте группы и нажмите «Далее» ещё раз.") : "Не удалось собрать список.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function goNext() {
    if (step === 1) {
      if (!picked.size) return;
      const ok = await loadPlan();
      if (ok) setStep(2);
      return;
    }
    if (step === 2 && path !== "add") {
      setStep(3);
      return;
    }
    setStep((s) => s + 1);
  }

  const lastStep = path === "add" ? 4 : 3;
  const stepLabels = path === "add" ? ["Группы", "Ученики", "Абонемент", "Выгрузка"] : ["Группы", "Ученики", "Выгрузка"];

  function applyTariff(groupKey: string, opt: TariffOpt | null) {
    const tariffId = opt?.id || 0;
    const subjectId = subjectOf[groupKey] || opt?.subjectIds?.[0] || 0;
    setByGroup((m) => ({ ...m, [groupKey]: { ...(m[groupKey] || { options: [] }), tariffId, tariffName: opt?.name || "" } }));
    setItems((list) =>
      list.map((it) => {
        if (`${it.branchId}:${it.groupId}` !== groupKey) return it;
        const subjects = [...new Set([subjectId, ...(opt?.subjectIds || []), it.subjectIds?.[0] || 0].filter(Boolean))];
        return {
          ...it,
          tariffId,
          tariffName: opt?.name || "",
          price: opt?.price || 0,
          periodCount: opt?.periodCount || it.periodCount,
          periodType: opt?.periodType || it.periodType,
          calcType: opt && Number(opt.calculationType) === 2 ? 1 : 0,
          subjectIds: subjects,
          lessonTypeIds: opt?.lessonTypeIds?.length ? opt.lessonTypeIds : [2],
          lessonsCount: opt?.lessonsCount || 0,
          skip: tariffId ? (it.status === "лид" ? "lead" : undefined) : "no-tariff",
        };
      }),
    );
  }

  function setGroupSubject(groupKey: string, subjectId: number) {
    setSubjectOf((m) => ({ ...m, [groupKey]: subjectId }));
    setItems((list) =>
      list.map((it) => {
        if (`${it.branchId}:${it.groupId}` !== groupKey) return it;
        const rest = (it.subjectIds || []).filter((id) => id && id !== it.subjectIds[0]);
        return { ...it, subjectIds: subjectId ? [subjectId, ...rest] : rest };
      }),
    );
  }

  const selected = items.filter((it) => chosen.has(pupilKey(it)));
  const ready = selected.filter((it) => it.tariffId);
  const noTariffGroups = Object.entries(byGroup).filter(([, v]) => !v.tariffId).length;

  async function runJob(mode: "assign" | "close" | "delete") {
    const pack =
      mode === "assign"
        ? ready.map((it) => ({
            ...it,
            periodCount,
            periodType,
            calcType,
            eDate: dateTo || addPeriod(date, periodCount, periodType),
            lessonTypeIds: it.lessonTypeIds?.length ? it.lessonTypeIds : [2],
          }))
        : selected;
    if (!pack.length) return;
    setBusy(true);
    const total = pack.length;
    const acc = { done: 0, skipped: 0, failed: [] as { name: string; error: string }[] };
    setResult(acc);
    const verb = mode === "delete" ? "Удаляю" : mode === "close" ? "Завершаю" : "Назначаю";
    const mins = assignEtaMin(total);
    setMsg(`${verb} ${total} учеников потихоньку, по ${ASSIGN_CHUNK} шт. Около ${mins} мин.`);
    try {
      for (let i = 0; i < pack.length; i += ASSIGN_CHUNK) {
        const chunk = pack.slice(i, i + ASSIGN_CHUNK);
        setMsg(`AlfaCRM: ${Math.min(i + chunk.length, total)} / ${total} · готово ${acc.done} · пауза`);
        const res = (await retryFetch(
          () =>
            adminSchedule({
              data: {
                token: token(),
                action: mode === "assign" ? "pupilTariffAssign" : "pupilTariffClear",
                mode: mode === "assign" ? "create" : mode,
                date: mode === "close" ? closeDate : date,
                skipExisting,
                groupKeys: [],
                pupilItems: chunk,
              } as never,
            }),
          1,
          180000,
        )) as {
          ok?: boolean;
          done?: number;
          skipped?: { id: number; name: string; reason: string }[];
          failed?: { id: number; name: string; error: string }[];
          error?: string;
        };
        if (!res.ok) {
          acc.failed.push({ name: `пачка ${i + 1}–${i + chunk.length}`, error: res.error || "AlfaCRM не приняла." });
        } else {
          acc.done += Number(res.done || 0);
          acc.skipped += (res.skipped || []).length;
          acc.failed.push(...(res.failed || []).map((f) => ({ name: f.name, error: f.error })));
        }
        setResult({ ...acc, failed: [...acc.failed] });
        if (i + ASSIGN_CHUNK < pack.length) await new Promise((r) => setTimeout(r, ASSIGN_BATCH_PAUSE_MS));
      }
      setMsg("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось выполнить.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-[1.4rem] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.08)] ring-1 ring-primary/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl text-primary">Мастер абонементов учеников</p>
          <p className="mt-0.5 text-sm text-muted">
            Режим сверху: добавить, изменить срок или удалить текущие.
          </p>
        </div>
        <button type="button" className="text-sm text-muted hover:text-fg" onClick={onClose}>
          Закрыть
        </button>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="shrink-0 text-sm font-medium text-muted">Выбор режима работы мастера</span>
        <div className="grid w-[30rem] max-w-full grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setPath("add");
              setJob("assign");
              setResult(null);
              setStep(1);
            }}
            className={cn("h-9 w-full rounded-[8px] text-sm font-semibold", path === "add" ? "bg-primary text-white" : "bg-surface-2 text-muted")}
          >
            Добавление
          </button>
          <button
            type="button"
            onClick={() => {
              setPath("change");
              setJob("close");
              setResult(null);
              setStep(1);
            }}
            className={cn("h-9 w-full rounded-[8px] text-sm font-semibold", path === "change" ? "bg-primary text-white" : "bg-surface-2 text-muted")}
          >
            Изменение
          </button>
          <button
            type="button"
            onClick={() => {
              setPath("remove");
              setJob("delete");
              setResult(null);
              setStep(1);
            }}
            className={cn("h-9 w-full rounded-[8px] text-sm font-semibold", path === "remove" ? "bg-primary text-white" : "bg-surface-2 text-muted")}
          >
            Удаление
          </button>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2 text-[0.78rem]">
        {stepLabels.map((label, i) => (
          <span key={label} className={cn("rounded-full px-3 py-1", step === i + 1 ? "bg-primary text-white" : "bg-surface-2 text-muted")}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {msg ? <p className="mt-3 text-sm text-amber-800">{msg}</p> : null}

      {step === 1 ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">
            {path === "add"
              ? "Выдать ученикам новые абонементы."
              : path === "change"
                ? "Закрыть текущие абонементы выбранной датой. CRM пересчитает остаток."
                : "Удалить текущие абонементы из AlfaCRM. Это необратимо."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={school} onChange={(e) => setSchool(e.target.value)} className="h-10 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-black/10">
              <option value="">Все школы</option>
              {schools.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {(
              [
                [0, "Все филиалы"],
                [2, "ЦМИТ"],
                [1, "Гражданская"],
                [3, "Луховицы"],
                [4, "Лето"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBranch(id)}
                className={cn("rounded-full px-3 py-1.5 text-sm", branch === id ? "bg-primary text-white" : "bg-surface-2")}
              >
                {label}
              </button>
            ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="группа, курс, педагог"
              className="h-10 min-w-[10rem] flex-1 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-black/10"
            />
          </div>
          <div className="flex gap-3 text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => setPicked(new Set(visible.map((g) => g.key)))}>
              выбрать все
            </button>
            <button type="button" className="text-muted hover:underline" onClick={() => setPicked(new Set())}>
              снять
            </button>
            <span className="text-muted">
              отмечено {picked.size} · на экране {visible.length}
            </span>
          </div>
          {unbound > 0 && school && school !== "Без школы на сайте" ? (
            <p className="text-sm text-muted">
              Ещё {unbound} {unbound === 1 ? "группа" : "групп"} без курса сайта. Откройте «Все школы» или «Без школы на сайте». Если группы нет совсем — «Загрузить из AlfaCRM» в расписании.
            </p>
          ) : null}
          <div className="max-h-72 overflow-auto rounded-2xl ring-1 ring-black/10">
            {visible.map((g) => (
              <label key={g.key} className={cn("flex cursor-pointer items-center gap-3 border-b border-black/5 px-3 py-2 text-sm last:border-0", picked.has(g.key) && "bg-sky-50")}>
                <input
                  type="checkbox"
                  checked={picked.has(g.key)}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(g.key)) n.delete(g.key);
                      else n.add(g.key);
                      return n;
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {g.groupId ? `№ ${g.groupId} · ` : ""}
                    {g.name}
                  </span>
                  {g.age ? <span className="ml-1 text-muted">{g.age}</span> : null}
                  <span className="mt-0.5 block text-[0.7rem] text-muted">
                    {g.school}
                    {g.course ? ` · ${g.course}` : ""}
                    {g.teacher ? ` · ${g.teacher}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[0.72rem] text-muted">
                  {g.taken || "—"}/{g.limit || "—"}
                </span>
              </label>
            ))}
            {!visible.length ? <p className="px-3 py-6 text-center text-sm text-muted">{busy ? "Загружаю группы…" : "Нет групп в этой выборке."}</p> : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeLeads} onChange={(e) => setIncludeLeads(e.target.checked)} />
            Включить лидов в группах (по умолчанию да — все привязанные)
          </label>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-4 space-y-3">
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setChosen(new Set((path === "add" ? items.filter((it) => it.tariffId) : items).map(pupilKey)))}
            >
              всех с абонементом
            </button>
            <button type="button" className="text-muted hover:underline" onClick={() => setChosen(new Set())}>
              снять
            </button>
            <span className="text-muted">
              отмечено {chosen.size} из {items.length}
              {path !== "add" ? " с активным абонементом" : ""}
            </span>
          </div>
          <div className="max-h-72 overflow-auto rounded-2xl ring-1 ring-black/10">
            {!items.length ? (
              <p className="px-3 py-4 text-sm text-muted">
                {path === "add" ? "В выбранных группах нет учеников." : "В выбранных группах нет детей с активным абонементом в CRM."}
              </p>
            ) : null}
            {items.map((it) => {
              const k = pupilKey(it);
              return (
                <label key={k} className={cn("flex cursor-pointer items-center gap-3 border-b border-black/5 px-3 py-2 text-sm last:border-0", chosen.has(k) && "bg-sky-50")}>
                  <input
                    type="checkbox"
                    checked={chosen.has(k)}
                    onChange={() =>
                      setChosen((s) => {
                        const n = new Set(s);
                        if (n.has(k)) n.delete(k);
                        else n.add(k);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{it.name}</span>
                    <span className="ml-1 text-[0.7rem] text-muted">{it.status}</span>
                    <span className="mt-0.5 block text-[0.7rem] text-muted">
                      {it.groupName}
                      {it.school ? ` · ${it.school}` : ""}
                      {path !== "add" && it.activeTariffs?.length
                        ? ` · ${it.activeTariffs.map((t) => t.name).join(", ")}`
                        : path !== "add" && it.tariffName
                          ? ` · ${it.tariffName}`
                          : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[0.72rem] text-muted">
                    {it.tariffName ? (
                      <>
                        {it.tariffName}
                        <span className="block">{money(it.price)}</span>
                      </>
                    ) : (
                      <span className="text-rose-700">нет абонемента студии</span>
                    )}
                  </span>
                </label>
              );
            })}
            {!items.length ? <p className="px-3 py-6 text-center text-sm text-muted">В выбранных группах нет учеников.</p> : null}
          </div>
        </div>
      ) : null}

      {path === "add" && step === 3 ? (
        <div className="mt-4 space-y-4">
          <div>
            <span className="mb-1.5 block text-[0.72rem] font-medium text-muted">Период у всех *</span>
            <div className="flex flex-wrap items-center gap-2 rounded-[16px] bg-surface-2 p-2 ring-1 ring-black/6">
              <span className="shrink-0 pl-1.5 text-[0.75rem] font-medium text-muted">с</span>
              <input
                type="date"
                min={ISO_DATE_MIN}
                max={ISO_DATE_MAX}
                value={date}
                onChange={(e) => {
                  const from = clampIsoDate(e.target.value);
                  setDate(from);
                  setDateTo(addPeriod(from, periodCount, periodType));
                }}
                className="h-10 w-[9.4rem] rounded-[12px] bg-white px-2 text-sm ring-1 ring-black/8"
              />
              <input
                type="number"
                min={1}
                value={periodCount || ""}
                placeholder="N"
                onChange={(e) => {
                  const count = Number(e.target.value) || 0;
                  setPeriodCount(count);
                  setDateTo(addPeriod(date, count, periodType));
                }}
                className="h-10 w-14 rounded-[12px] bg-white px-1 text-center text-sm font-semibold ring-1 ring-black/8"
              />
              <div className="flex rounded-full bg-white p-0.5 ring-1 ring-black/8">
                {PERIOD_HINTS.filter((u) => u.id !== 4).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setPeriodType(u.id);
                      setDateTo(addPeriod(date, periodCount, u.id));
                    }}
                    className={cn(
                      "h-9 rounded-full px-2.5 text-[0.75rem] font-semibold",
                      periodType === u.id ? "bg-primary text-white" : "text-muted hover:text-fg",
                    )}
                  >
                    {periodCount ? `${periodCount} ${periodWord(periodCount, u)}` : u.many}
                  </button>
                ))}
              </div>
              <span className="text-[0.75rem] font-medium text-muted">до</span>
              <input type="date" min={ISO_DATE_MIN} max={ISO_DATE_MAX} value={dateTo} onChange={(e) => setDateTo(clampIsoDate(e.target.value))} className="h-10 w-[9.4rem] rounded-[12px] bg-white px-2 text-sm ring-1 ring-black/8" />
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-[0.72rem] font-medium text-muted">Тип расчётов *</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setCalcType(0)}
                className={cn("rounded-[16px] px-4 py-3 text-left ring-1", calcType === 0 ? "bg-primary/8 ring-primary/35" : "bg-surface-2 ring-black/6")}
              >
                <p className="text-sm font-semibold">Базовый</p>
                <p className="mt-0.5 text-[0.75rem] text-muted">Общий счёт карточки</p>
              </button>
              <button
                type="button"
                onClick={() => setCalcType(1)}
                className={cn("rounded-[16px] px-4 py-3 text-left ring-1", calcType === 1 ? "bg-primary/8 ring-primary/35" : "bg-surface-2 ring-black/6")}
              >
                <p className="text-sm font-semibold">Раздельный</p>
                <p className="mt-0.5 text-[0.75rem] text-muted">Отдельный счёт — как в карточке ученика</p>
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
            Пропускать, если этот абонемент уже висит на ученике
          </label>
          {noTariffGroups ? (
            <p className="text-sm text-amber-800">
              У {noTariffGroups} групп нет подходящего абонемента студии (предмет + филиал + минуты). Сначала мастер студии или выберите абонемент вручную.
            </p>
          ) : null}
          <div className="max-h-[28rem] overflow-auto rounded-[8px] ring-1 ring-black/10">
            <div className="sticky top-0 z-10 hidden grid-cols-[minmax(9rem,1.1fr)_minmax(11rem,1fr)_7.5rem_7.5rem_minmax(10rem,1.1fr)] gap-2 bg-surface-2 px-3 py-1.5 text-[0.68rem] font-medium uppercase tracking-wider text-muted lg:grid">
              <span>Группа</span>
              <span>Абонемент</span>
              <span>Школа</span>
              <span>Курс</span>
              <span>Предмет</span>
            </div>
            {Object.entries(byGroup).map(([key, info]) => {
              const g = groups.find((x) => x.key === key);
              const subjectId = subjectOf[key] || g?.subjectId || 0;
              const opt = info.options.find((o) => o.id === info.tariffId);
              const match = tariffMatchesSubject(opt, subjectId);
              const box = "h-9 w-full rounded-[8px] bg-surface-2 px-2 text-sm ring-1 ring-black/10";
              return (
                <div
                  key={key}
                  className="grid items-center gap-2 border-b border-black/5 px-3 py-2 text-sm last:border-0 lg:grid-cols-[minmax(9rem,1.1fr)_minmax(11rem,1fr)_7.5rem_7.5rem_minmax(10rem,1.1fr)]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={g?.name || key}>
                      {g?.name || key}
                    </p>
                    {g?.age ? <p className="text-[0.7rem] text-muted">{g.age}</p> : null}
                  </div>
                  <select
                    className={box}
                    value={info.tariffId || ""}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      applyTariff(key, info.options.find((o) => o.id === id) || null);
                    }}
                  >
                    <option value="">— нет —</option>
                    {info.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} · {money(o.price)}
                      </option>
                    ))}
                  </select>
                  <div>
                    <p className="mb-0.5 text-[0.65rem] text-muted lg:hidden">Школа · карточка группы</p>
                    <div className={cn(box, "flex items-center truncate text-[0.78rem] text-muted")} title="Из карточки группы">
                      {g?.school || "—"}
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[0.65rem] text-muted lg:hidden">Курс · карточка группы</p>
                    <div className={cn(box, "flex items-center truncate text-[0.78rem] text-muted")} title="Из карточки группы">
                      {g?.course || "—"}
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[0.65rem] text-muted lg:hidden">Предмет</p>
                    <select
                      className={cn(box, info.tariffId && !match && "ring-amber-400")}
                      value={subjectId || ""}
                      title={match || !info.tariffId ? "Предмет из раздела «Предметы»" : "Этот абонемент в CRM к предмету не привязан"}
                      onChange={(e) => setGroupSubject(key, Number(e.target.value) || 0)}
                    >
                      <option value="">— предмет —</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      {subjectId && !subjects.some((s) => s.id === subjectId) ? (
                        <option value={subjectId}>предмет {subjectId}</option>
                      ) : null}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[0.72rem] text-muted">
            Школа и курс — из карточки группы. Предмет — из раздела «Предметы». В AlfaCRM уходит только предмет абонемента.
          </p>
        </div>
      ) : null}

      {(path === "add" && step === 4) || (path !== "add" && step === 3) ? (
        <div className="mt-4 space-y-3">
          {result ? (
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200">
              <p className="font-display text-lg text-emerald-900">{busy ? "Идёт выгрузка…" : "Готово"}</p>
              <p className="mt-1">
                Выдано {result.done}. Пропущено (уже были): {result.skipped}. Ошибок: {result.failed.length}.
              </p>
              {result.failed.length ? (
                <ul className="mt-2 max-h-32 overflow-auto text-[0.78rem] text-rose-800">
                  {result.failed.map((f) => (
                    <li key={f.name}>
                      {f.name}: {f.error}
                    </li>
                  ))}
                </ul>
              ) : null}
              {!busy ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    className="h-9 px-4 text-sm"
                    onClick={() => {
                      setResult(null);
                      setMsg("");
                      setStep(1);
                    }}
                  >
                    Продолжить работу с мастером
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {path === "add" ? (
                <p className="text-sm text-muted">
                  Выдать {ready.length} абонементов с {date.split("-").reverse().join(".")}. По {ASSIGN_CHUNK} шт., около {assignEtaMin(ready.length)} мин. Дубликаты {skipExisting ? "пропустим" : "создадим ещё раз"}.
                </p>
              ) : null}
              {path === "change" ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Текущие абонементы {selected.length} учеников закроются датой</span>
                  <input type="date" min={ISO_DATE_MIN} max={ISO_DATE_MAX} value={closeDate} onChange={(e) => setCloseDate(clampIsoDate(e.target.value))} className="h-9 rounded-[8px] bg-white px-2 text-sm ring-1 ring-black/10" />
                  <span className="text-muted">· CRM пересчитает остаток. Около {assignEtaMin(selected.length)} мин.</span>
                </div>
              ) : null}
              {path === "remove" ? (
                <p className="text-sm text-rose-800">
                  Текущие абонементы {selected.length} учеников удалятся из AlfaCRM. Это необратимо. Около {assignEtaMin(selected.length)} мин, с паузой.
                </p>
              ) : null}
              <div className="max-h-72 overflow-auto rounded-2xl ring-1 ring-black/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-2 text-[0.68rem] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2">Ученик</th>
                      <th className="px-3 py-2">Группа</th>
                      <th className="px-3 py-2">Абонемент</th>
                      <th className="px-3 py-2">Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(job === "assign" ? ready : selected).map((it) => (
                      <tr key={pupilKey(it)} className="border-t border-black/6">
                        <td className="px-3 py-2">{it.name}</td>
                        <td className="px-3 py-2">{it.groupName}</td>
                        <td className="px-3 py-2">{it.tariffName || "текущий абонемент CRM"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.price ? money(it.price) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" className="h-9 px-4 text-sm" onClick={step === 1 || result ? onClose : () => setStep((s) => s - 1)}>
          {step === 1 || result ? "Закрыть" : "Назад"}
        </Button>
        {step < lastStep ? (
          <Button type="button" className="h-9 px-4 text-sm" disabled={busy || (step === 1 && !picked.size) || (step === 2 && !chosen.size)} onClick={() => void goNext()}>
            {busy && step === 1 ? "Читаю состав…" : "Далее"}
          </Button>
        ) : result && !busy ? (
          <Button
            type="button"
            className="h-9 px-4 text-sm"
            onClick={() => {
              setResult(null);
              setMsg("");
              setStep(1);
            }}
          >
            Продолжить работу с мастером
          </Button>
        ) : result ? null : (
          <Button
            type="button"
            className="h-9 px-4 text-sm"
            disabled={busy || (job === "assign" ? !ready.length : !selected.length)}
            onClick={() => void runJob(job)}
          >
            {busy
              ? "Выгружаю потихоньку…"
              : job === "close"
                ? `Завершить · ${selected.length}`
                : job === "delete"
                  ? `Удалить · ${selected.length}`
                  : `Назначить в CRM · ${ready.length}`}
          </Button>
        )}
      </div>
    </article>
  );
}
