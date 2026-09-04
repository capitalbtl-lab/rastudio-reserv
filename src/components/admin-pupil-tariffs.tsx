"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { retryFetch } from "@/lib/retry-fetch";
import { RaSelect } from "@/components/ra-select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tariffMatchesSubject, ASSIGN_CHUNK, ASSIGN_BATCH_PAUSE_MS, assignEtaMin, PLAN_GROUP_CHUNK, TARIFF_READ_CHUNK, collapsePupilsByCustomer, pupilListStats, groupsBySchoolId, bySchoolId, dropoutsAfterJob, personKey, changeListRows, batchesOfThree, SLOW_VERIFY, SLOW_SPEED } from "@/data/pupil-tariffs";
import { ISO_DATE_MAX, ISO_DATE_MIN, clampIsoDate } from "@/data/admin-ui";

type PupilGroup = {
  key: string;
  groupId: number;
  branchId: number;
  name: string;
  school: string;
  schoolId?: string;
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
  schoolId?: string;
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
  if (/502|504|Bad Gateway|timeout|таймаут|<!DOCTYPE|<html|nginx/i.test(raw)) {
    return "Сервер оборвал длинный запрос. Нажмите «Далее» ещё раз — продолжим.";
  }
  if (/groupKeys|invalid input|invalid_type/i.test(raw)) return fallback;
  if (raw.length > 160 || /<[a-z][\s\S]*>/i.test(raw)) return fallback;
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

function tariffSelectGroups(options: TariffOpt[], school: string) {
  const map = new Map<string, { value: string; label: string }[]>();
  for (const o of options) {
    const key = o.school || "Без школы";
    const list = map.get(key) || [];
    list.push({ value: String(o.id), label: `${o.name} · ${money(o.price)}` });
    map.set(key, list);
  }
  const names = [...map.keys()].sort((a, b) => {
    if (school && a === school) return -1;
    if (school && b === school) return 1;
    if (a === "Без школы") return 1;
    if (b === "Без школы") return -1;
    return a.localeCompare(b, "ru");
  });
  return names.map((n) => ({
    label: n,
    options: (map.get(n) || []).sort((a, b) => a.label.localeCompare(b.label, "ru")),
  }));
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
  school?: string;
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
  const [byBranch, setByBranch] = useState<Record<number, { total: number; withPeople: number; kids?: number }>>({});
  const [countsLive, setCountsLive] = useState(false);
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
  const [pace, setPace] = useState<"select" | "fast" | "slow">("select");
  const [log, setLog] = useState<{ at: string; text: string }[]>([]);
  const [closeDate, setCloseDate] = useState(todayIso);
  const [result, setResult] = useState<{ done: number; skipped: number; failed: { name: string; error: string }[] } | null>(null);
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [subjectOf, setSubjectOf] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    label: string;
    unit: string;
    extra: string;
  } | null>(null);
  const [summary, setSummary] = useState("");
  const loadedGroupsRef = useRef(new Set<string>());
  const pickSigRef = useRef("");
  const bySchoolRun = useRef(false);

  function clock() {
    return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  function note(text: string) {
    setLog((prev) => [...prev.slice(-120), { at: clock(), text }]);
    setMsg(text);
  }

  async function loadGroups() {
    setBusy(true);
    setMsg("");
    try {
      const [res, sub] = await Promise.all([
        retryFetch(
          () => adminSchedule({ data: { token: token(), action: "pupilTariffGroups", groupKeys: [] } as never }),
          2,
          12000,
        ) as Promise<{
          ok?: boolean;
          groups?: PupilGroup[];
          schools?: string[];
          unbound?: number;
          byBranch?: Record<number, { total: number; withPeople: number; kids?: number }>;
          kids?: number;
          error?: string;
        }>,
        retryFetch(
          () => adminSchedule({ data: { token: token(), action: "subjectsGet" } as never }),
          1,
          15000,
        ).catch(() => null) as Promise<{ ok?: boolean; subjects?: { id: number; name: string }[] } | null>,
      ]);
      if (res.ok) {
        const list = res.groups || [];
        setGroups(list);
        setSchools(res.schools || []);
        setUnbound(Number(res.unbound || 0));
        setByBranch(res.byBranch || {});
        setCountsLive(false);
        loadedGroupsRef.current = new Set();
        if (pace === "fast" || pace === "slow") setPicked(new Set(list.map((g) => g.key)));
        note(`Список групп обновлён: ${list.length}`);
      } else setMsg(res.error || "Не удалось прочитать группы.");
      if (sub && "subjects" in sub && Array.isArray(sub.subjects)) setSubjects(sub.subjects);
    } catch (e) {
      setMsg(e instanceof Error ? friendlyErr(e, "Не удалось прочитать группы. Нажмите «Перезагрузить список».") : "Не удалось прочитать группы.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadGroups();
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
    const pickSig = [...picked].sort().join("|");
    if (pickSigRef.current !== pickSig) {
      pickSigRef.current = pickSig;
      loadedGroupsRef.current = new Set();
    }
    const selected = groups.filter((g) => picked.has(g.key));
    const allPicked = groups.length > 0 && picked.size === groups.length;
    const slow = pace === "slow";
    bySchoolRun.current = allPicked || pace === "fast" || slow;
    const schoolWaves = allPicked || pace === "fast" || slow ? groupsBySchoolId(selected) : ([[ "", selected ]] as [string, typeof selected][]);
    const waves = slow
      ? schoolWaves.flatMap(([sid, list]) => batchesOfThree(list).map((part, i) => [`${sid}:${i}`, part] as [string, typeof selected]))
      : schoolWaves;
    const total = selected.length;
    const rows: PupilTariffItem[] = [];
    const grouped: Record<string, GroupTariff> = {};
    let scanned = 0;
    let archived = 0;
    setProgress({ done: loadedGroupsRef.current.size, total, label: "Читаю учеников", unit: "групп", extra: "" });
    setSummary("");
    setLog([]);
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const pause = (ms: number) => wait(slow ? ms * SLOW_SPEED : ms);
    const readTariffs = async (list: PupilTariffItem[], label: string) => {
      for (let t = 0; t < list.length; t += TARIFF_READ_CHUNK) {
        const part = list.slice(t, t + TARIFF_READ_CHUNK);
        setProgress({
          done: t,
          total: list.length,
          label: `${label}: абонементы`,
          unit: "чел. группы",
          extra: `${Math.min(t + part.length, list.length)} из ${list.length} этой группы`,
        });
        setMsg(`${label}: абонементы ${t + 1}–${Math.min(t + part.length, list.length)} из ${list.length}`);
        let partOk = false;
        for (let attempt = 0; attempt < 5 && !partOk; attempt += 1) {
          try {
            const active = (await retryFetch(
              () => adminSchedule({ data: { token: token(), action: "pupilTariffActive", pupilItems: part } as never }),
              1,
              25000,
            )) as { ok?: boolean; items?: PupilTariffItem[]; archivedOnly?: number };
            if (active.ok) {
              archived += Number(active.archivedOnly || 0);
              const byKey = new Map((active.items || []).map((r) => [`${r.branchId}:${r.customerId}`, r]));
              for (let ri = 0; ri < rows.length; ri += 1) {
                const hit = byKey.get(`${rows[ri].branchId}:${rows[ri].customerId}`);
                if (hit) rows[ri] = { ...rows[ri], ...hit };
              }
              partOk = true;
            } else await pause(600 * (attempt + 1));
          } catch (e) {
            setMsg(friendlyErr(e, `${label}: абонементы, повтор ${attempt + 1}`));
            await pause(700 * (attempt + 1));
          }
        }
        if (!partOk) return false;
      }
      return true;
    };
    try {
      for (const [, schoolGroups] of waves) {
        const title = bySchoolRun.current ? schoolGroups[0]?.school || "Школа сайта" : "Ученики";
        const ids = schoolGroups.map((g) => g.groupId).join(", ");
        note(slow ? `${title}: пачка № ${ids}` : `${title}`);
        const schoolDone = () => schoolGroups.filter((g) => loadedGroupsRef.current.has(g.key)).length;
        const pending = schoolGroups.filter((g) => !loadedGroupsRef.current.has(g.key));
        for (let i = 0; i < pending.length; ) {
          let take = Math.min(PLAN_GROUP_CHUNK, pending.length - i);
          let ok = false;
          for (let attempt = 0; attempt < 8 && !ok; attempt += 1) {
            if (attempt >= 2) take = 1;
            const slice = pending.slice(i, i + take);
            const part = slice.map((g) => ({ branchId: g.branchId, groupId: g.groupId }));
            setMsg(`${title}: группа № ${slice.map((g) => g.groupId).join(", ")}`);
            note(`${title}: читаю группу № ${slice.map((g) => g.groupId).join(", ")}`);
            setProgress({
              done: schoolDone(),
              total: schoolGroups.length,
              label: title,
              unit: "групп этой школы",
              extra: allPicked ? `всего ${loadedGroupsRef.current.size} из ${total} по всем школам сайта` : `${loadedGroupsRef.current.size} из ${total}`,
            });
            try {
              const res = (await retryFetch(
                () =>
                  adminSchedule({
                    data: { token: token(), action: "pupilTariffPlan", includeLeads: path === "add" && includeLeads, groupKeys: part } as never,
                  }),
                1,
                40000,
              )) as { ok?: boolean; items?: PupilTariffItem[]; byGroup?: Record<string, GroupTariff>; scanned?: number };
              if (res.ok) {
                const fresh = res.items || [];
                rows.push(...fresh);
                Object.assign(grouped, res.byGroup || {});
                scanned += Number(res.scanned || fresh.length);
                for (const g of slice) loadedGroupsRef.current.add(g.key);
                setGroups((prev) =>
                  prev.map((g) => {
                    const n = rows.filter((r) => r.groupId === g.groupId && r.branchId === g.branchId).length;
                    return n ? { ...g, taken: n } : g;
                  }),
                );
                i += slice.length;
                ok = true;
                if (path !== "add" && fresh.length) {
                  const tag = `${title} · № ${slice.map((g) => g.groupId).join(", ")}`;
                  const tariffsOk = await readTariffs(fresh, tag);
                  if (!tariffsOk) {
                    for (const g of slice) loadedGroupsRef.current.delete(g.key);
                    setMsg(`${tag}: абонементы группы не прочитались. Нажмите «Далее» — эту группу повторим.`);
                    setItems(collapsePupilsByCustomer(rows));
                    setByGroup(grouped);
                    return false;
                  }
                }
              } else {
                await pause(700 * (attempt + 1));
              }
            } catch (e) {
              setMsg(friendlyErr(e, `${title}: повтор ${attempt + 1}`));
              await pause(700 * (attempt + 1));
            }
          }
          if (!ok) {
            setMsg(`${title}: не прочитал группу. Нажмите «Далее» — продолжим с этой школы.`);
            if (rows.length) {
              setItems(path === "add" ? rows : collapsePupilsByCustomer(rows));
              setByGroup(grouped);
            }
            return false;
          }
        }
      }
      const live = path === "add" ? rows : changeListRows(rows);
      const list = path === "add" ? rows : live;
      if (path !== "add" && rows.length && !live.length) {
        setMsg("В CRM нет учеников с живым абонементом. Лиды без абонемента (как Майоров) в изменении не участвуют.");
      }
      if (!rows.length) {
        setMsg("Не удалось прочитать учеников. Нажмите «Далее» ещё раз.");
        return false;
      }
      const stats = pupilListStats(path === "add" ? rows : list);
      setItems(list);
      setGroups((prev) =>
        prev.map((g) => {
          const n = rows.filter((r) => r.groupId === g.groupId && r.branchId === g.branchId).length;
          return n ? { ...g, taken: n } : g;
        }),
      );
      setCountsLive(true);
      setByGroup(grouped);
      setChosen(new Set(path === "add" ? list.filter((r) => r.status === "учится" || r.status === "лид").map(pupilKey) : list.map(pupilKey)));
      setSubjectOf(Object.fromEntries(groups.filter((g) => picked.has(g.key)).map((g) => [g.key, g.subjectId || 0])));
      const sample = list.find((r) => r.tariffId);
      if (sample) {
        const count = Number(sample.periodCount) || 0;
        const unit = Number(sample.periodType) || 3;
        setPeriodCount(count);
        setPeriodType(unit);
        setCalcType(Number(sample.calcType) || 0);
        setDateTo(addPeriod(date, count, unit));
      }
      const parts = [`Прочитано ${loadedGroupsRef.current.size} групп`, `${stats.unique} учеников`];
      if (stats.dual) {
        parts.push(
          path === "add"
            ? `${stats.dual} ходят в две группы — две строки`
            : `${stats.dual} ходят в две группы — в изменении/удалении это один человек`,
        );
      }
      if (stats.leads) parts.push(`лидов ${stats.leads}`);
      if (path !== "add" && archived) parts.push(`истекших пропущено ${archived}`);
      setSummary(parts.join(". ") + ".");
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
    const mins = assignEtaMin(total) * (pace === "slow" ? SLOW_SPEED : 1);
    const schoolWaves = bySchoolRun.current || pace === "slow" ? bySchoolId(pack) : ([[ "", pack ]] as [string, typeof pack][]);
    const waves =
      pace === "slow"
        ? schoolWaves.flatMap(([sid, list]) => batchesOfThree(list).map((part, i) => [`${sid}:${i}`, part] as [string, typeof pack]))
        : schoolWaves;
    setProgress({ done: 0, total, label: verb, unit: "учеников", extra: pace === "slow" ? `медленно, по 3 группы, около ${mins} мин` : `около ${mins} мин, по ${ASSIGN_CHUNK}` });
    setMsg("");
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const pause = (ms: number) => wait(pace === "slow" ? ms * SLOW_SPEED : ms);
    const rounds = pace === "slow" ? SLOW_VERIFY : 3;
    try {
      let doneN = 0;
      for (const [, schoolPack] of waves) {
        const title = bySchoolRun.current || pace === "slow" ? schoolPack[0]?.school || verb : verb;
        const ids = [...new Set(schoolPack.map((p) => p.groupId))].join(", ");
        note(`${title}: выгрузка групп № ${ids}, ${schoolPack.length} чел.`);
        const send = async (list: typeof schoolPack) => {
          const failedKeys = new Set<string>();
          for (let i = 0; i < list.length; ) {
            const chunk = list.slice(i, i + ASSIGN_CHUNK);
            let ok = false;
            for (let attempt = 0; attempt < 8 && !ok; attempt += 1) {
              setProgress({
                done: doneN,
                total,
                label: `${verb} · ${title}`,
                unit: "учеников",
                extra: `готово ${acc.done} · пропуск ${acc.skipped} · ошибок ${acc.failed.length}`,
              });
              setMsg(`${title}: ${i + 1}–${Math.min(i + chunk.length, list.length)} из ${list.length}`);
              for (const p of chunk) {
                note(`${verb} ${p.name} · группа № ${p.groupId} · ${p.tariffName || "абонемент CRM"}`);
              }
              try {
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
                if (res.ok) {
                  acc.done += Number(res.done || 0);
                  acc.skipped += (res.skipped || []).length;
                  for (const f of res.failed || []) {
                    acc.failed.push({ name: f.name, error: f.error });
                    failedKeys.add(personKey(chunk.find((x) => x.customerId === f.id)?.branchId || chunk[0].branchId, f.id));
                  }
                  i += chunk.length;
                  doneN += chunk.length;
                  ok = true;
                } else await pause(800 * (attempt + 1));
              } catch (e) {
                setMsg(friendlyErr(e, `${title}: повтор ${attempt + 1}`));
                await pause(800 * (attempt + 1));
              }
            }
            if (!ok) {
              for (const p of chunk) failedKeys.add(personKey(p.branchId, p.customerId));
              i += chunk.length;
            }
            setResult({ ...acc, failed: [...acc.failed] });
            if (i < list.length) await pause(ASSIGN_BATCH_PAUSE_MS);
          }
          return failedKeys;
        };
        let leftover = [...schoolPack];
        for (let round = 0; round < rounds; round += 1) {
          if (round === 0 || leftover.length) {
            note(`${title} № ${ids}: ${round === 0 ? "вношу" : "добиваю выпавших"} · ${leftover.length} чел.`);
            const failedKeys = await send(leftover);
            leftover = leftover.filter((p) => failedKeys.has(personKey(p.branchId, p.customerId)));
          }
          note(`${title} № ${ids}: сверка ${round + 1}/${rounds}`);
          try {
            const active = (await retryFetch(
              () => adminSchedule({ data: { token: token(), action: "pupilTariffActive", pupilItems: schoolPack } as never }),
              1,
              50000,
            )) as { ok?: boolean; items?: PupilTariffItem[] };
            leftover = active.ok
              ? dropoutsAfterJob(mode === "assign" ? "assign" : mode, schoolPack, active.items || [], closeDate)
              : leftover;
          } catch {
            /* leftover as is */
          }
          if (leftover.length) {
            note(`${title} № ${ids}: выпали ${leftover.map((p) => p.name).join(", ")}`);
            await pause(1200);
          } else {
            note(`${title} № ${ids}: сверка ${round + 1}/${rounds} — все на месте`);
            if (pace !== "slow") break;
          }
        }
        if (leftover.length) {
          acc.failed.push(...leftover.map((p) => ({ name: p.name, error: "выпал после круга школы" })));
          setResult({ ...acc, failed: [...acc.failed] });
          setMsg(`${title}: после проверки выпали ${leftover.length}. Нажмите ещё раз — эту школу добьём.`);
          return;
        }
        setMsg(`${title}: круг закрыт`);
      }
      setMsg("");
    } catch (e) {
      setMsg(e instanceof Error ? friendlyErr(e, "Не удалось выполнить.") : "Не удалось выполнить.");
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
              setIncludeLeads(false);
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
              setIncludeLeads(false);
              setResult(null);
              setStep(1);
            }}
            className={cn("h-9 w-full rounded-[8px] text-sm font-semibold", path === "remove" ? "bg-primary text-white" : "bg-surface-2 text-muted")}
          >
            Удаление
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-sm font-medium text-muted">Темп</span>
        {(
          [
            ["select", "Выборочно"],
            ["fast", "Все быстро"],
            ["slow", "Все медленно"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPace(id);
              if (id === "fast" || id === "slow") setPicked(new Set(groups.map((g) => g.key)));
            }}
            className={cn("h-9 rounded-[8px] px-3 text-sm font-semibold", pace === id ? "bg-primary text-white" : "bg-surface-2 text-muted")}
          >
            {label}
          </button>
        ))}
        <span className="text-[0.75rem] text-muted">
          {pace === "slow"
            ? "По 3 группы по номеру: опрос → изменение → сверка 3 раза, вдвое медленнее, лог по каждому."
            : pace === "fast"
              ? "Все группы, школа за школой, обычная скорость."
              : "Отметьте нужные группы сами."}
        </span>
      </div>
      <div className="mt-6 flex flex-wrap gap-2 text-[0.78rem]">
        {stepLabels.map((label, i) => (
          <span key={label} className={cn("rounded-full px-3 py-1", step === i + 1 ? "bg-primary text-white" : "bg-surface-2 text-muted")}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {msg ? <p className="mt-3 text-sm text-amber-800">{msg}</p> : null}
      {busy && progress ? (
        <div className="mt-3 rounded-[12px] bg-surface-2 p-3 ring-1 ring-black/8">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{progress.label}</span>
            <span className="text-muted">
              {progress.done} / {progress.total} {progress.unit}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-black/6">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
            />
          </div>
          {progress.extra ? <p className="mt-2 text-[0.75rem] text-muted">{progress.extra}</p> : null}
        </div>
      ) : null}
      {log.length ? (
        <div className="mt-3 max-h-40 overflow-auto rounded-[12px] bg-surface-2 p-3 text-[0.75rem] leading-5 ring-1 ring-black/8">
          {log.map((row, i) => (
            <p key={`${row.at}-${i}`}>
              <span className="text-muted">{row.at}</span>
              <span className="ml-2 text-fg">{row.text}</span>
            </p>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">
            {groups.length > 0 && picked.size === groups.length
              ? pace === "slow"
                ? "Все медленно: школа сайта, группы по номеру пачками по 3, сверка трижды."
                : "Выбраны все группы: полный круг по школам сайта."
              : "Выборочно — отметьте группы. «Все быстро» / «Все медленно» отмечают все."}
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
            ).map(([id, label]) => {
              const n = id ? byBranch[id]?.total || 0 : groups.length;
              return (
              <button
                key={id}
                type="button"
                onClick={() => setBranch(id)}
                className={cn("rounded-full px-3 py-1.5 text-sm", branch === id ? "bg-primary text-white" : "bg-surface-2")}
              >
                {label}
                <span className={cn("ml-1.5 text-[0.7rem]", branch === id ? "text-white/80" : "text-muted")}>
                  {n}
                </span>
              </button>
            );
            })}
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
            <button type="button" className="text-primary hover:underline" disabled={busy} onClick={() => void loadGroups()}>
              Перезагрузить список
            </button>
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
                  {g.taken ? `${g.taken}${g.limit ? `/${g.limit}` : ""}` : busy ? "…" : "—"}
                </span>
              </label>
            ))}
            {!visible.length ? (
              <p className="px-3 py-6 text-center text-sm text-muted">
                {busy ? "Загружаю группы…" : groups.length ? "Нет групп в этой выборке." : "Нет групп в расписании. Во вкладке «Группы» нажмите «Загрузить из AlfaCRM»."}
              </p>
            ) : null}
          </div>
          {path === "add" ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeLeads} onChange={(e) => setIncludeLeads(e.target.checked)} />
            Включить лидов в группах (по умолчанию да — все привязанные)
          </label>
          ) : (
            <p className="text-sm text-muted">Изменение и удаление — только ученики с живым абонементом в CRM. Лиды без абонемента не входят.</p>
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-4 space-y-3">
          {summary ? <p className="rounded-[12px] bg-surface-2 px-3 py-2 text-sm text-muted">{summary}</p> : null}
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setChosen(new Set(items.map(pupilKey)))}
            >
              {path === "add" ? "всех" : "всех с абонементом"}
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
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[0.72rem] text-muted">
                    {path !== "add" && (it.activeTariffs || []).length ? (
                      <>
                        {it.tariffName}
                        <span className="block">{money(it.price)}</span>
                      </>
                    ) : it.tariffName && path === "add" ? (
                      <>
                        {it.tariffName}
                        <span className="block">{money(it.price)}</span>
                      </>
                    ) : path === "add" ? (
                      <span className="text-muted">на шаге «Абонемент»</span>
                    ) : (
                      <span className="text-rose-700">нет в CRM</span>
                    )}
                  </span>
                </label>
              );
            })}
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
              У {noTariffGroups} групп абонемент не подобрался сам (часто робототехника: минуты или предмет в карточке не совпали). Выберите тариф в списке ниже — он уйдёт всем отмеченным детям этой группы.
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
            {Object.entries(byGroup)
              .sort(([ka], [kb]) => {
                const a = groups.find((g) => g.key === ka);
                const b = groups.find((g) => g.key === kb);
                return (
                  (a?.school || "").localeCompare(b?.school || "", "ru") ||
                  (a?.course || "").localeCompare(b?.course || "", "ru") ||
                  (a?.name || "").localeCompare(b?.name || "", "ru")
                );
              })
              .map(([key, info], i, rows) => {
              const g = groups.find((x) => x.key === key);
              const prev = i ? groups.find((x) => x.key === rows[i - 1][0]) : null;
              const schoolHead = g?.school && g.school !== prev?.school ? g.school : "";
              const subjectId = subjectOf[key] || g?.subjectId || 0;
              const opt = info.options.find((o) => o.id === info.tariffId);
              const match = tariffMatchesSubject(opt, subjectId);
              const box = "h-9 w-full rounded-[8px] bg-surface-2 px-2 text-sm ring-1 ring-black/10";
              return (
                <div key={key}>
                  {schoolHead ? (
                    <p className="bg-[#eef4fb] px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-primary">
                      {schoolHead}
                    </p>
                  ) : null}
                <div
                  className="grid items-center gap-2 border-b border-black/5 px-3 py-2 text-sm last:border-0 lg:grid-cols-[minmax(9rem,1.1fr)_minmax(11rem,1fr)_7.5rem_7.5rem_minmax(10rem,1.1fr)]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={g?.name || key}>
                      {g?.name || key}
                    </p>
                    {g?.age ? <p className="text-[0.7rem] text-muted">{g.age}</p> : null}
                  </div>
                  <RaSelect
                    className={box}
                    menuMinWidth={420}
                    value={info.tariffId ? String(info.tariffId) : ""}
                    placeholder="— нет —"
                    groups={tariffSelectGroups(info.options, g?.school || "")}
                    onChange={(v) => {
                      const id = Number(v);
                      applyTariff(key, info.options.find((o) => o.id === id) || null);
                    }}
                  />
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
                    <RaSelect
                      className={cn(box, info.tariffId && !match && "ring-amber-400")}
                      menuMinWidth={280}
                      value={subjectId ? String(subjectId) : ""}
                      placeholder="— предмет —"
                      options={[
                        ...subjects
                          .slice()
                          .sort((a, b) => a.name.localeCompare(b.name, "ru"))
                          .map((s) => ({ value: String(s.id), label: s.name })),
                        ...(subjectId && !subjects.some((s) => s.id === subjectId)
                          ? [{ value: String(subjectId), label: `предмет ${subjectId}` }]
                          : []),
                      ]}
                      onChange={(v) => setGroupSubject(key, Number(v) || 0)}
                    />
                  </div>
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
            {busy && step === 1 ? "Читаю…" : "Далее"}
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
