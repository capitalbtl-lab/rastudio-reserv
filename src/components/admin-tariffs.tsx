"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { retryFetch } from "@/lib/retry-fetch";
import { loadFromDisk, pullFromCrm } from "@/lib/crm-pull";
import { CrmPullDialog, emptyPull, type CrmPullState } from "@/components/crm-pull-dialog";
import { adminPrices } from "@/data/admin";
import { adminPriceFormulas } from "@/data/price-formulas";
import { PRICE_DIRECTIONS, type PriceRow } from "@/data/prices-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CrmTariff, CrmLessonType, CrmBranch } from "@/data/crm-tariffs";

const CALC_NAMES: Record<number, string> = { 0: "Любой", 1: "Базовый счет", 2: "Отдельный счет" };
const TYPE_NAMES: Record<number, string> = { 1: "Поурочная", 2: "Помесячная", 3: "Недельная" };
const PERIOD_UNITS: { id: number; name: string }[] = [
  { id: 1, name: "дней" },
  { id: 2, name: "недель" },
  { id: 3, name: "месяцев" },
  { id: 4, name: "лет" },
];
const LESSON_TYPE_ORDER = [2, 5, 10, 11, 3, 4, 1, 15, 13, 7, 6, 8, 12, 9, 14];

function sortLessonTypes(list: CrmLessonType[]) {
  return [...list].sort((a, b) => {
    const ia = LESSON_TYPE_ORDER.indexOf(a.id);
    const ib = LESSON_TYPE_ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name, "ru");
  });
}

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

type GroupHit = { id: string; gid: number; name: string; branch: string; branchId?: number; age: string; mins: number; subjectId?: number; courseId?: string };
type Row = CrmTariff & { groups: GroupHit[] };
type Change = { id: number; field: string; from: string; to: string };
type Probe = {
  id: number;
  name: string;
  price: number;
  lessonsCount: number;
  duration: number;
  branch: string;
  subjectId?: number;
  subjectName?: string;
  periodCount?: number;
  periodLabel?: string;
  verifiedName?: string;
  verifiedPrice?: number;
  verifiedSubjects?: number[];
  checks?: { ok: boolean; label: string }[];
  url?: string;
  error?: string;
};

const BRANCH_ORDER = [2, 1, 3, 4];
const FALLBACK_TYPES: CrmLessonType[] = [
  { id: 2, name: "Групповое" },
  { id: 5, name: "Вводное" },
  { id: 10, name: "Дополнительное" },
  { id: 11, name: "Сверхурочное" },
  { id: 3, name: "Пробное" },
  { id: 4, name: "Отработка" },
  { id: 1, name: "Индивидуальное" },
  { id: 15, name: "Летняя программа" },
  { id: 13, name: "Собеседование" },
  { id: 7, name: "Открытый урок" },
  { id: 6, name: "Мастер-класс" },
  { id: 8, name: "Экскурсия" },
  { id: 12, name: "Мероприятие" },
  { id: 9, name: "Летний лагерь" },
  { id: 14, name: "Продленка" },
];
const FALLBACK_BRANCHES: CrmBranch[] = [
  { id: 2, name: "ЦМИТ, Октябрьской революции, 340", short: "ЦМИТ" },
  { id: 1, name: "Гражданская, 2", short: "Гражданская" },
  { id: 3, name: "Луховицы, Пушкина, 202А", short: "Луховицы" },
  { id: 4, name: "Летние программы", short: "Лето" },
];

function money(n: number) {
  return `${Math.round(Number(n) || 0).toLocaleString("ru-RU")} ₽`;
}

function isoToRu(iso: string) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

function ruToIso(ru: string) {
  const m = String(ru || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function maskRuDate(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

function RuDateField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(isoToRu(value));
  useEffect(() => {
    setText(isoToRu(value));
  }, [value]);
  return (
    <input
      className={className}
      inputMode="numeric"
      placeholder="26.09.2026"
      value={text}
      onChange={(e) => {
        const next = maskRuDate(e.target.value);
        setText(next);
        if (!next) onChange("");
        else if (next.length === 10) onChange(ruToIso(next));
      }}
      onBlur={() => {
        const iso = ruToIso(text);
        if (iso) {
          setText(isoToRu(iso));
          onChange(iso);
        } else if (text.trim()) {
          setText(isoToRu(value));
        }
      }}
    />
  );
}

const PACKS = [
  { id: "none", weeks: 4, period: 0, type: 0, label: "не задан (не сгорает)" },
  { id: "w4", weeks: 4, period: 4, type: 2, label: "4 недели" },
  { id: "w8", weeks: 8, period: 8, type: 2, label: "8 недель" },
  { id: "d14", weeks: 2, period: 14, type: 1, label: "14 дней" },
  { id: "d30", weeks: 4, period: 30, type: 1, label: "30 дней" },
  { id: "d60", weeks: 8, period: 60, type: 1, label: "60 дней" },
  { id: "m9", weeks: 4, period: 9, type: 3, label: "9 месяцев — учебный год" },
  { id: "m3", weeks: 4, period: 3, type: 3, label: "3 месяца — лето" },
] as const;

function PeriodPicker({
  count,
  type,
  onChange,
}: {
  count: number;
  type: number;
  onChange: (count: number, type: number) => void;
}) {
  const [text, setText] = useState(count ? String(count) : "");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setText(count ? String(count) : "");
  }, [count]);
  const n = Number(String(text).replace(/\D/g, "")) || 0;
  function plural(n: number, one: string, few: string, many: string) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 > 20)) return few;
    return many;
  }
  const options = n
    ? [
        { id: 1, label: `${n} ${plural(n, "день", "дня", "дней")}` },
        { id: 2, label: `${n} ${plural(n, "неделя", "недели", "недель")}` },
        { id: 3, label: `${n} ${plural(n, "месяц", "месяца", "месяцев")}` },
      ]
    : [];
  const picked = options.find((o) => o.id === type && n === count);
  return (
    <div className="relative">
      <input
        className="h-10 w-full rounded-xl bg-white px-3 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-primary/30"
        inputMode="numeric"
        placeholder="Введите цифру"
        value={text}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
          setText(digits);
          setOpen(Boolean(digits));
          if (!digits) onChange(0, 0);
        }}
        onFocus={() => {
          if (n) setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
      />
      {open && options.length ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/10">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={cn("block w-full px-3 py-1.5 text-left text-sm hover:bg-sky-50", o.id === type && n === count && "bg-sky-50 font-medium")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(n, o.id);
                setText(String(n));
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
      {count && picked && !open ? <p className="mt-1 text-[0.7rem] text-muted">Выбрано: {picked.label}</p> : count && !open ? <p className="mt-1 text-[0.7rem] text-muted">Выбрано: {count} {PERIOD_UNITS.find((u) => u.id === type)?.name || ""}</p> : null}
    </div>
  );
}

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function blank(branchId: number): Row {
  return {
    id: -Date.now(),
    name: "Новый абонемент",
    price: 0,
    lessonsCount: 4,
    duration: 60,
    type: 1,
    typeName: "Поурочная",
    archive: false,
    branchIds: branchId ? [branchId] : [2],
    subjectIds: [],
    lessonTypeIds: [2, 5, 10, 11],
    calculationType: 2,
    calculationName: "Отдельный счет",
    periodCount: 0,
    periodType: 0,
    periodLabel: "",
    pricePerLesson: 0,
    bDate: "",
    eDate: "",
    added: "",
    cardOk: false,
    groups: [],
  };
}

export function AdminTariffs() {
  const [items, setItems] = useState<Row[]>([]);
  const [types, setTypes] = useState<CrmLessonType[]>([]);
  const [subjects, setSubjects] = useState<{ id: number; name: string; href?: string }[]>([]);
  const [branches, setBranches] = useState<CrmBranch[]>(FALLBACK_BRANCHES);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [subQ, setSubQ] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [branch, setBranch] = useState<number>(2);
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiComment, setAiComment] = useState("");
  const [aiChanges, setAiChanges] = useState<Change[]>([]);
  const [aiAdds, setAiAdds] = useState<Partial<CrmTariff>[]>([]);
  const [listen, setListen] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const dictBase = useRef("");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [wiz, setWiz] = useState(false);
  const [pull, setPull] = useState<CrmPullState>(emptyPull("tariffs"));

  async function loadLocal() {
    setBusy(true);
    try {
      const res = await retryFetch(() => loadFromDisk("tariffs"));
      if (!res.ok) {
        setMsg(res.error || "Не удалось прочитать абонементы с сайта.");
        return res;
      }
      if ("tariffs" in res && Array.isArray(res.tariffs)) setItems(res.tariffs as Row[]);
      if ("lessonTypes" in res && Array.isArray(res.lessonTypes)) setTypes(res.lessonTypes as CrmLessonType[]);
      if ("subjects" in res && Array.isArray(res.subjects)) setSubjects(res.subjects as { id: number; name: string; href?: string }[]);
      if ("branches" in res && Array.isArray(res.branches) && res.branches.length) setBranches(res.branches as CrmBranch[]);
      if ("at" in res && res.at) setAt(String(res.at));
      setMsg("");
      return res;
    } catch (e) {
      const fail = { ok: false as const, error: e instanceof Error ? e.message : "Не удалось загрузить абонементы." };
      setMsg(fail.error);
      return fail;
    } finally {
      setBusy(false);
    }
  }

  async function run(
    action:
      | "tariffsSave"
      | "tariffsPush"
      | "tariffsDelete"
      | "tariffsAiPreview"
      | "tariffsAiApply"
      | "tariffsProbe"
      | "tariffsProbeDelete",
    extra?: Record<string, unknown>,
  ) {
    setBusy(true);
    try {
    const mutate = action === "tariffsPush" || action === "tariffsDelete" || action === "tariffsProbe" || action === "tariffsProbeDelete" || action === "tariffsAiApply" || action === "tariffsAiPreview";
    const res = await retryFetch(
      () => adminSchedule({ data: { token: token(), action, ...extra } as never }),
      mutate ? 1 : 2,
      mutate ? 180000 : 12000,
    );
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return res;
    }
    if ("tariffs" in res && Array.isArray(res.tariffs)) setItems(res.tariffs as Row[]);
    if ("lessonTypes" in res && Array.isArray(res.lessonTypes)) setTypes(res.lessonTypes as CrmLessonType[]);
    if ("subjects" in res && Array.isArray(res.subjects)) setSubjects(res.subjects as { id: number; name: string; href?: string }[]);
    if ("branches" in res && Array.isArray(res.branches) && res.branches.length) setBranches(res.branches as CrmBranch[]);
    if ("at" in res && res.at) setAt(String(res.at));
    return res;
    } catch (e) {
      const fail = { ok: false as const, error: e instanceof Error ? e.message : "Не удалось загрузить абонементы." };
      setMsg(fail.error);
      return fail;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadLocal();
  }, []);

  const nameOf = (id: number) => subjects.find((s) => s.id === id)?.name || `предмет ${id}`;
  const tabs = (branches.length ? branches : FALLBACK_BRANCHES).slice().sort((a, b) => BRANCH_ORDER.indexOf(a.id) - BRANCH_ORDER.indexOf(b.id));
  const typeList = sortLessonTypes(types.length ? types : FALLBACK_TYPES);
  const subjectList = useMemo(() => [...subjects].sort((a, b) => a.name.localeCompare(b.name, "ru")), [subjects]);

  const counts = useMemo(() => {
    const live = items.filter((t) => showArchive || !t.archive);
    return Object.fromEntries(tabs.map((b) => [b.id, live.filter((t) => t.branchIds.includes(b.id)).length]));
  }, [items, showArchive, tabs]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((t) => {
        if (!showArchive && t.archive) return false;
        if (branch && !t.branchIds.includes(branch)) return false;
        if (!needle) return true;
        const hay = `${t.name} ${t.subjectIds.map(nameOf).join(" ")} ${t.id}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => (a.id < 0 ? -1 : 0) || a.price - b.price || a.name.localeCompare(b.name, "ru"));
  }, [items, q, showArchive, subjects, branch]);

  function patch(id: number, next: Partial<Row>) {
    setItems((list) =>
      list.map((t) => {
        if (t.id !== id) return t;
        const merged = { ...t, ...next };
        const lessons = Number(merged.lessonsCount || 0);
        const price = Number(merged.price || 0);
        merged.pricePerLesson = lessons ? Math.round((price / lessons) * 100) / 100 : 0;
        if (next.calculationType != null) merged.calculationName = CALC_NAMES[Number(next.calculationType)] || "Любой";
        if (next.type != null) merged.typeName = TYPE_NAMES[Number(next.type)] || "Поурочная";
        if (next.periodCount != null || next.periodType != null) {
          const count = Number(merged.periodCount || 0);
          const unit = Number(merged.periodType || 1);
          const names: Record<number, [string, string, string]> = {
            1: ["день", "дня", "дней"],
            2: ["неделя", "недели", "недель"],
            3: ["месяц", "месяца", "месяцев"],
            4: ["год", "года", "лет"],
          };
          const w = names[unit];
          if (!count || !w) merged.periodLabel = "";
          else {
            const n = count % 100;
            merged.periodLabel = `${count} ${n % 10 === 1 && n !== 11 ? w[0] : n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n > 20) ? w[1] : w[2]}`;
          }
        }
        return merged;
      }),
    );
    setDirty((d) => new Set(d).add(id));
  }

  function togglePick(id: number) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function addLocal() {
    const t = blank(branch || 2);
    setItems((list) => [t, ...list]);
    setOpen(t.id);
    setPicked((s) => new Set(s).add(t.id));
    setDirty((d) => new Set(d).add(t.id));
    setMsg("Новая карточка на сайте. Заполните и нажмите «Выгрузить в AlfaCRM».");
  }

  function toggleDictation() {
    const w = window as unknown as { webkitSpeechRecognition?: new () => Rec; SpeechRecognition?: new () => Rec };
    type Rec = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal?: boolean } & ArrayLike<{ transcript: string }>>;
      }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!SR) {
      setMsg("Голосовой ввод в этом браузере недоступен.");
      return;
    }
    if (listen && recRef.current) {
      recRef.current.stop();
      setListen(false);
      return;
    }
    dictBase.current = aiPrompt.trim();
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript || "";
        if (e.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      const spoken = (finalText || interim).replace(/\s+/g, " ").trim();
      setAiPrompt([dictBase.current, spoken].filter(Boolean).join(" "));
      if (finalText.trim()) dictBase.current = [dictBase.current, finalText.trim()].filter(Boolean).join(" ");
    };
    rec.onend = () => setListen(false);
    recRef.current = rec;
    rec.start();
    setListen(true);
  }

  const opened = items.find((t) => t.id === open) || null;
  const pickedList = items.filter((t) => picked.has(t.id));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onClick={addLocal}>
          Добавить абонемент вручную
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setWiz(true)}>
          Мастер абонементов студии
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
          setPull({ ...emptyPull("tariffs"), open: true, step: "Подключаюсь к AlfaCRM…" });
          const st = await pullFromCrm("tariffs", (step, lines, done, total) => {
            setPull((u) => (u.done ? u : { ...u, step: step || u.step, lines, added: done, total }));
          });
          if (!st.ok) {
            setPull((u) => ({ ...u, done: true, error: st.error || "AlfaCRM не ответила." }));
            return;
          }
          setDirty(new Set());
          setPull({
            open: true,
            kind: "tariffs",
            step: "",
            done: true,
            error: String((st as { error?: string }).error || ""),
            lines: ((st as { lines?: { ok: boolean; text: string }[] }).lines || []) as { ok: boolean; text: string }[],
            added: Number((st as { added?: number }).added || 0),
            updated: 0,
            total: Number((st as { total?: number }).total || 0),
          });
          await loadLocal();
        }}>
          Загрузить из AlfaCRM
        </Button>
        <Button type="button" variant="secondary" disabled={busy || !dirty.size} onClick={async () => {
          const res = await run("tariffsSave", { tariffs: items.filter((t) => dirty.has(t.id)) });
          if (res.ok) {
            setDirty(new Set());
            setMsg("Сохранено на сайте.");
          }
        }}>
          Сохранить на сайте
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
          if (!pickedList.length) {
            setMsg("Отметьте абонементы галочкой — выгрузятся только они.");
            return;
          }
          setMsg(`Выгружаю в AlfaCRM: ${pickedList.length}…`);
          const res = await run("tariffsPush", { tariffs: pickedList });
          const pushed = "pushed" in res ? Number(res.pushed || 0) : 0;
          const failed = "failed" in res ? Number(res.failed || 0) : 0;
          if (res.ok || pushed) {
            setDirty(new Set());
            setMsg(failed ? `Выгружено ${pushed}, сбоев ${failed}.` : `Выгружено в AlfaCRM: ${pushed}.`);
          }
        }}>
          Выгрузить в AlfaCRM
        </Button>
        <Button type="button" variant="secondary" disabled={busy || !picked.size} onClick={async () => {
          if (!confirm(`Удалить ${picked.size} абонемент(ов)? В CRM они уйдут в архив.`)) return;
          const res = await run("tariffsDelete", { ids: [...picked].map(String) });
          if (res.ok) {
            setPicked(new Set());
            setOpen(null);
            setMsg("Удалены на сайте и отправлены в архив CRM.");
          }
        }}>
          Удалить выбранные{picked.size ? ` · ${picked.size}` : ""}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
          setMsg("Создаю проверочную карточку в AlfaCRM…");
          const res = await run("tariffsProbe");
          if (res.ok && "probe" in res && res.probe) {
            setProbe(res.probe as Probe);
            setMsg("");
          }
        }}>
          Проверить раздел
        </Button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="поиск" className="h-10 min-w-[10rem] flex-1 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-black/10" />
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} />
          архив
        </label>
        {at ? <span className="text-xs text-muted">{new Date(at).toLocaleString("ru-RU")}</span> : null}
      </div>

      {wiz ? (
        <TariffWizard
          busy={busy}
          tabs={tabs}
          typeList={typeList}
          subjectList={subjectList}
          existing={items}
          onClose={() => setWiz(false)}
          onCreate={async (drafts, push) => {
            setItems((list) => [...drafts, ...list]);
            setDirty((d) => {
              const n = new Set(d);
              drafts.forEach((t) => n.add(t.id));
              return n;
            });
            setPicked((s) => {
              const n = new Set(s);
              drafts.forEach((t) => n.add(t.id));
              return n;
            });
            const saved = await run("tariffsSave", { tariffs: drafts });
            if (!saved.ok) return;
            if (push) {
              setMsg(`Создано ${drafts.length}. Выгружаю в AlfaCRM…`);
              const res = await run("tariffsPush", { tariffs: drafts });
              const pushed = "pushed" in res ? Number(res.pushed || 0) : 0;
              const err = "error" in res && res.error ? String(res.error) : "";
              setMsg(pushed ? `Создано и выгружено в CRM: ${pushed}.${err ? ` ${err}` : ""}` : err || "Создано на сайте, выгрузка не прошла.");
            } else {
              setMsg(`Создано на сайте: ${drafts.length}. Отмечены галочкой — можно выгрузить в CRM.`);
            }
            setWiz(false);
            setOpen(0);
          }}
        />
      ) : null}

      {probe ? (
        <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="font-display text-lg text-emerald-900">Проверочная карточка создана в AlfaCRM</p>
          <p className="mt-1 text-sm leading-relaxed">
            №{probe.id} · {probe.name}. {probe.lessonsCount} урок / {probe.duration} мин · {money(probe.price)}
            {probe.periodLabel ? ` · период ${probe.periodLabel}` : ""} · филиалы {probe.branch}
            {probe.subjectName ? ` · предметы: ${probe.subjectName}` : ""}.
            {probe.verifiedName ? ` В CRM сейчас: «${probe.verifiedName}», ${money(Number(probe.verifiedPrice || 0))}${probe.verifiedSubjects?.length ? `, предметов ${probe.verifiedSubjects.length}` : ""}.` : ""}
          </p>
          <p className="mt-1 text-[0.78rem] text-muted">Откройте Абонементы в CRM и найдите это имя — так видно, что выгрузка дошла. Потом удалите карточку, чтобы не висела в прайсе.</p>
          {probe.checks?.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {probe.checks.map((c) => (
                <li key={c.label} className={c.ok ? "text-emerald-800" : "text-rose-700"}>
                  {c.ok ? "ок" : "сбой"} · {c.label}
                </li>
              ))}
            </ul>
          ) : null}
          {probe.error ? <p className="mt-1 text-sm text-amber-800">{probe.error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {probe.url ? (
              <a href={probe.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-[0.78rem] font-semibold ring-1 ring-black/10">
                Открыть карточку в CRM
              </a>
            ) : null}
            <Button type="button" className="h-8 px-3 text-[0.78rem]" disabled={busy} onClick={async () => {
              const res = await run("tariffsProbeDelete", { ids: [String(probe.id)] });
              if (res.ok) {
                setProbe(null);
                setMsg(`Проверочная карточка №${probe.id} удалена (архив CRM).`);
              }
            }}>
              Удалить проверочную карточку
            </Button>
          </div>
        </div>
      ) : null}

      <article className="rounded-3xl bg-gradient-to-br from-[#e8f0ff] via-white to-[#eef4ff] p-4 ring-2 ring-primary/35 shadow-[0_10px_28px_rgba(32,94,220,0.18)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-xl text-primary">Добавить / исправить абонементы</p>
          <div className="flex flex-wrap items-center gap-2 text-[0.72rem] text-muted">
            <span>отмечено {picked.size}</span>
            <button type="button" className="font-semibold text-primary" onClick={() => setPicked(new Set(view.map((t) => t.id)))}>Выделить всё</button>
            <button type="button" className="font-semibold text-primary" onClick={() => setPicked(new Set())}>Снять</button>
          </div>
        </div>
        <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">
          Галочками выберите абонементы — помощник правит только их. Можно: «цену 3200», «8 занятий», «90 мин», «добавь абонемент 2800/8/60 Super Minds на ЦМИТ и Гражданскую».
        </p>
        <div className="mt-3 flex items-start gap-2">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void (async () => {
                  const res = await run("tariffsAiPreview", { prompt: aiPrompt, ids: [...picked].map(String) });
                  if (res.ok) {
                    setAiComment(String(("comment" in res && res.comment) || ""));
                    setAiChanges((("changes" in res && res.changes) || []) as Change[]);
                    setAiAdds((("adds" in res && res.adds) || []) as Partial<CrmTariff>[]);
                  }
                })();
              }
            }}
            placeholder="Поставь цену 3 200 выделенным. Или: добавь абонемент 4 000 / 4 занятия / 90 мин, робототехника 7–9, ЦМИТ."
            className="min-h-10 min-w-0 flex-1 resize-none overflow-hidden rounded-xl bg-surface-2 px-3 py-2 text-sm leading-6 ring-1 ring-black/10"
          />
          <button
            type="button"
            title="Предпросмотр"
            disabled={busy || !aiPrompt.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
            onClick={async () => {
              const res = await run("tariffsAiPreview", { prompt: aiPrompt, ids: [...picked].map(String) });
              if (res.ok) {
                setAiComment(String(("comment" in res && res.comment) || ""));
                setAiChanges((("changes" in res && res.changes) || []) as Change[]);
                setAiAdds((("adds" in res && res.adds) || []) as Partial<CrmTariff>[]);
              }
            }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h12M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button
            type="button"
            title="Голосовой ввод"
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10", listen ? "bg-primary text-white" : "bg-surface-2 text-fg")}
            onClick={toggleDictation}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>
          </button>
        </div>
        {aiComment && !aiChanges.length && !aiAdds.length ? <p className="mt-2 text-sm text-muted">{aiComment}</p> : null}
        {aiChanges.length || aiAdds.length ? (
          <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-black/8">
            <p className="text-sm font-semibold">Предпросмотр{aiComment ? ` · ${aiComment}` : ""}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {aiChanges.map((c, i) => (
                <li key={`${c.id}-${i}`}>
                  №{c.id}: {c.field} {c.from} → <b>{c.to}</b>
                </li>
              ))}
              {aiAdds.map((a, i) => (
                <li key={`add-${i}`}>новый: {a.name} · {money(Number(a.price || 0))} · {a.lessonsCount} зан. / {a.duration} мин</li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-8 px-3 text-[0.78rem]" onClick={() => { setAiChanges([]); setAiAdds([]); }}>Отменить</Button>
              <Button type="button" className="h-8 px-3 text-[0.78rem]" disabled={busy} onClick={async () => {
                const res = await run("tariffsAiApply", {
                  changes: aiChanges.map((c) => ({ id: String(c.id), field: c.field, to: c.to })),
                  tariffs: aiAdds,
                });
                if (res.ok) {
                  setAiChanges([]);
                  setAiAdds([]);
                  setAiPrompt("");
                  setMsg("Правки на сайте. Выгрузите отмеченные в AlfaCRM.");
                }
              }}>Опубликовать изменения</Button>
            </div>
          </div>
        ) : null}
      </article>

      <div className="flex flex-wrap items-end gap-1 border-b border-black/10">
        {tabs.map((b) => (
          <button key={b.id} type="button" title={b.name} onClick={() => setBranch(b.id)} className={cn("rounded-t-xl px-5 py-2 text-sm font-semibold transition-colors", branch === b.id ? "bg-primary text-white" : "bg-surface-2 text-fg hover:bg-white")}>
            {b.short}
            <span className={cn("ml-1.5 text-[0.7rem] font-medium", branch === b.id ? "text-white/80" : "text-muted")}>{counts[b.id] || 0}</span>
          </button>
        ))}
        <button type="button" onClick={() => setBranch(0)} className={cn("rounded-t-xl px-5 py-2 text-sm font-semibold", branch === 0 ? "bg-primary text-white" : "bg-surface-2 text-fg hover:bg-white")}>
          Все
          <span className={cn("ml-1.5 text-[0.7rem]", branch === 0 ? "text-white/80" : "text-muted")}>{items.filter((t) => showArchive || !t.archive).length}</span>
        </button>
      </div>

      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <div className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
        <table className="w-full text-left text-sm">
          <thead className="text-[0.65rem] uppercase tracking-wider text-muted">
            <tr>
              <th className="w-10 px-3 py-3">
                <input type="checkbox" checked={view.length > 0 && view.every((t) => picked.has(t.id))} onChange={(e) => setPicked(e.target.checked ? new Set(view.map((t) => t.id)) : new Set())} />
              </th>
              <th className="w-16 py-3">ID</th>
              <th className="py-3">Абонемент</th>
              <th className="w-28 py-3">Цена</th>
              <th className="w-32 py-3">Пакет</th>
              <th className="py-3">Предметы</th>
              <th className="w-16 py-3 text-center">Группы</th>
              <th className="w-12 py-3" />
            </tr>
          </thead>
          <tbody>
            {!view.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-sm text-muted">
                  {busy ? "Загружаю абонементы…" : "В этой выборке абонементов нет. Нажмите «Все» или «Загрузить из AlfaCRM»."}
                </td>
              </tr>
            ) : null}
            {view.map((t) => {
              const empty = !t.subjectIds.length;
              const groups = branch ? t.groups.filter((g) => g.branchId === branch) : t.groups;
              const isOpen = open === t.id;
              return (
                <Fragment key={`${t.id}-${branch}`}>
                  <tr className={cn("border-t border-black/6 align-middle transition-colors hover:bg-sky-50", t.archive && "opacity-55", isOpen && "bg-sky-50", picked.has(t.id) && !isOpen && "bg-sky-50/40")}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={picked.has(t.id)} onChange={() => togglePick(t.id)} />
                    </td>
                    <td className="py-2 font-mono text-xs text-muted">{t.id > 0 ? t.id : "новый"}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">
                        {t.name}
                        {dirty.has(t.id) ? <span className="ml-1 text-[0.7rem] text-amber-600">●</span> : null}
                      </div>
                      <div className="text-[0.7rem] text-muted">
                        {t.typeName || TYPE_NAMES[t.type] || "Поурочная"}
                        {t.periodLabel ? ` · ${t.periodLabel}` : ""}
                        {t.eDate ? ` · до ${isoToRu(t.eDate)}` : ""}
                        {" · "}
                        {t.branchIds.map((id) => tabs.find((b) => b.id === id)?.short || id).join(" · ") || "филиал не указан"}
                      </div>
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <div>{money(t.price)}</div>
                      {t.pricePerLesson ? <div className="text-[0.7rem] text-muted">{money(t.pricePerLesson)} / урок</div> : null}
                    </td>
                    <td className="py-2 whitespace-nowrap text-muted">{t.lessonsCount} зан. / {t.duration} мин</td>
                    <td className="py-2 pr-3">
                      {empty ? (
                        <span className="text-[0.75rem] font-semibold text-rose-600">нет предметов</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {t.subjectIds.slice(0, 2).map((id) => (
                            <span key={id} className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[0.7rem] text-sky-900 ring-1 ring-sky-100">{nameOf(id)}</span>
                          ))}
                          {t.subjectIds.length > 2 ? <span className="text-[0.7rem] text-muted">+{t.subjectIds.length - 2}</span> : null}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-center text-sm text-muted">{groups.length || "—"}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        title={isOpen ? "Свернуть" : "Открыть карточку"}
                        onClick={() => { setOpen(isOpen ? null : t.id); setSubQ(""); }}
                        className={cn("flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none ring-1 ring-black/10 transition-colors", isOpen ? "bg-primary text-white" : "bg-black/[0.05] text-fg hover:bg-primary hover:text-white")}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && opened ? (
                    <tr className="bg-[#edf4fb]">
                      <td colSpan={8} className="px-4 pb-5 pt-2">
                        <Editor
                          t={opened}
                          busy={busy}
                          tabs={tabs}
                          typeList={typeList}
                          subjectList={subjectList}
                          subQ={subQ}
                          setSubQ={setSubQ}
                          groups={groups}
                          onPatch={(next) => patch(opened.id, next)}
                          onSave={async () => {
                            const current = items.find((x) => x.id === opened.id) || opened;
                            const { groups: _g, ...tariff } = current;
                            const res = await run("tariffsSave", { tariff });
                            if (res.ok) {
                              setDirty((d) => { const n = new Set(d); n.delete(opened.id); return n; });
                              setMsg("Сохранено на сайте.");
                            }
                            return res;
                          }}
                          onPush={async () => {
                            const current = items.find((x) => x.id === opened.id) || opened;
                            const { groups: _g, ...tariff } = current;
                            const saved = await run("tariffsSave", { tariff });
                            if (!saved.ok) return saved;
                            const res = await run("tariffsPush", { tariff });
                            if (res.ok) {
                              setDirty((d) => { const n = new Set(d); n.delete(opened.id); return n; });
                              setMsg(opened.id > 0 ? `Абонемент ${opened.id} выгружен в AlfaCRM.` : "Новый абонемент создан в AlfaCRM.");
                            }
                            return res;
                          }}
                          onDelete={async () => {
                            if (!confirm("Удалить этот абонемент? В CRM он уйдёт в архив.")) return { ok: false, error: "Отменено." };
                            const res = await run("tariffsDelete", { ids: [String(opened.id)] });
                            if (res.ok) {
                              setOpen(null);
                              setPicked((s) => { const n = new Set(s); n.delete(opened.id); return n; });
                              setMsg("Абонемент удалён.");
                            }
                            return res;
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {view.length ? null : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">
                  {busy ? "Читаю абонементы с сайта…" : items.length ? "В этом филиале нет абонементов под фильтр." : "На сайте пока нет абонементов. Нажмите «Загрузить из AlfaCRM»."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <CrmPullDialog pull={pull} onClose={() => setPull((u) => ({ ...u, open: false }))} />
    </section>
  );
}

function Chip({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-left text-[0.8rem] leading-tight transition-colors",
        on ? "bg-primary text-white shadow-sm" : "bg-white text-fg ring-1 ring-black/10 hover:bg-sky-50",
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[0.72rem] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function Editor({
  t,
  busy,
  tabs,
  typeList,
  subjectList,
  subQ,
  setSubQ,
  groups,
  onPatch,
  onSave,
  onPush,
  onDelete,
}: {
  t: Row;
  busy: boolean;
  tabs: CrmBranch[];
  typeList: CrmLessonType[];
  subjectList: { id: number; name: string; href?: string }[];
  subQ: string;
  setSubQ: (v: string) => void;
  groups: GroupHit[];
  onPatch: (next: Partial<Row>) => void;
  onSave: () => Promise<{ ok?: boolean; error?: string } | void>;
  onPush: () => Promise<{ ok?: boolean; error?: string } | void>;
  onDelete: () => Promise<{ ok?: boolean; error?: string } | void>;
}) {
  const [note, setNote] = useState("");
  const needle = subQ.trim().toLowerCase();
  const selectedSubs = subjectList.filter((s) => t.subjectIds.includes(s.id));
  const filtered = (needle ? subjectList.filter((s) => s.name.toLowerCase().includes(needle)) : subjectList);
  const catalog = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const per = t.lessonsCount ? Math.round((Number(t.price) / Number(t.lessonsCount)) * 100) / 100 : 0;
  const box = "h-10 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.06]">
      <div className="grid items-end gap-3 md:grid-cols-12">
        <Field label="Название" className="md:col-span-12">
          <input className={cn(box, "font-medium")} value={t.name} onChange={(e) => onPatch({ name: e.target.value })} />
        </Field>

        <Field label="Уроков в пакете" className="md:col-span-2">
          <input className={box} inputMode="numeric" value={t.lessonsCount || ""} onChange={(e) => onPatch({ lessonsCount: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Минут урока" className="md:col-span-2">
          <input className={box} inputMode="numeric" value={t.duration || ""} onChange={(e) => onPatch({ duration: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Стоимость пакета" className="md:col-span-3">
          <input className={box} inputMode="decimal" value={t.price || ""} onChange={(e) => onPatch({ price: Number(e.target.value) || 0 })} />
        </Field>
        <div className="md:col-span-5">
          <span className="mb-1 block text-[0.72rem] font-medium text-muted">Цена за урок</span>
          <div className="flex h-10 items-center rounded-xl bg-sky-50 px-3 ring-1 ring-sky-100">
            <span className="text-base font-semibold text-sky-950">{per ? money(per) : "—"}</span>
            <span className="ml-2 text-[0.75rem] text-muted">считается из стоимости и числа уроков</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-12">
        <div className="md:col-span-4">
          <div className="mb-1.5 text-[0.72rem] font-medium text-muted">Тарификация</div>
          <div className="flex rounded-xl bg-[#f3f6fa] p-1">
            {([
              [1, "Поурочная"],
              [2, "Помесячная"],
              [3, "Недельная"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onPatch({ type: id, typeName: label })}
                className={cn(
                  "h-9 flex-1 rounded-[0.7rem] text-[0.82rem] font-medium transition-colors",
                  Number(t.type || 1) === id ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Клиентский счёт" className="md:col-span-2">
          <select className={box} value={t.calculationType || 0} onChange={(e) => onPatch({ calculationType: Number(e.target.value) })}>
            <option value={0}>Любой</option>
            <option value={1}>Базовый счет</option>
            <option value={2}>Отдельный счет</option>
          </select>
        </Field>
        <Field label="Период действия" className="md:col-span-4">
          <PeriodPicker
            count={Number(t.periodCount || 0)}
            type={Number(t.periodType || 1)}
            onChange={(count, type) => onPatch({ periodCount: count, periodType: type, periodLabel: "" })}
          />
          <p className="mt-1 text-[0.7rem] text-muted">Цифра → дни / недели / месяцы.</p>
        </Field>
        <Field label="Конец действия" className="md:col-span-2">
          <RuDateField
            value={t.eDate || ""}
            onChange={(iso) => onPatch({ eDate: iso })}
            className={box}
          />
          <p className="mt-1 text-[0.7rem] text-muted">дд.мм.гггг. В CRM это «Конец действия», не путать с кнопкой «Завершить с».</p>
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 text-[0.72rem] font-medium text-muted">Филиалы</div>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((b) => (
            <Chip key={b.id} on={t.branchIds.includes(b.id)} onClick={() => onPatch({ branchIds: toggleId(t.branchIds, b.id) })}>
              {b.short}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className="text-[0.72rem] font-medium text-muted">Типы уроков</span>
          <span className="text-[0.72rem] text-muted">{t.lessonTypeIds.length} из {typeList.length}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {typeList.map((lt) => (
            <Chip key={lt.id} on={t.lessonTypeIds.includes(lt.id)} onClick={() => onPatch({ lessonTypeIds: toggleId(t.lessonTypeIds, lt.id) })}>
              {lt.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[0.72rem] font-medium text-muted">Предметы</span>
          <span className="text-[0.72rem] text-muted">{t.subjectIds.length} выбрано</span>
          {selectedSubs.length ? (
            <button type="button" className="text-[0.72rem] text-primary hover:underline" onClick={() => onPatch({ subjectIds: [] })}>
              снять все
            </button>
          ) : null}
          {needle && filtered.length ? (
            <button
              type="button"
              className="text-[0.72rem] text-primary hover:underline"
              onClick={() => onPatch({ subjectIds: [...new Set([...t.subjectIds, ...filtered.map((s) => s.id)])] })}
            >
              выбрать найденные
            </button>
          ) : null}
        </div>
        {selectedSubs.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedSubs.map((s) => (
              <button
                key={s.id}
                type="button"
                title="Убрать предмет"
                onClick={() => onPatch({ subjectIds: t.subjectIds.filter((id) => id !== s.id) })}
                className="max-w-full truncate rounded-full bg-sky-50 px-2.5 py-1 text-[0.75rem] text-sky-950 ring-1 ring-sky-100 hover:bg-rose-50 hover:text-rose-800"
              >
                {s.name} ×
              </button>
            ))}
          </div>
        ) : (
          <p className="mb-2 text-[0.78rem] text-rose-600">Предметы не выбраны — абонемент не привяжется к группам.</p>
        )}
        <div className="overflow-hidden rounded-2xl ring-1 ring-black/10">
          <div className="flex items-center gap-2 bg-[#f6f8fb] px-3 py-2">
            <input
              value={subQ}
              onChange={(e) => setSubQ(e.target.value)}
              placeholder="Найти предмет"
              className="h-8 flex-1 rounded-lg bg-white px-3 text-sm outline-none ring-1 ring-black/8"
            />
            <span className="shrink-0 text-[0.7rem] text-muted">{catalog.length}</span>
          </div>
          <div className="max-h-48 overflow-auto bg-white px-2 py-1.5 [scrollbar-width:thin]">
            <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
              {catalog.map((s) => {
                const on = t.subjectIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[0.8rem] leading-snug",
                      on ? "bg-sky-50 text-sky-950" : "hover:bg-[#f6f8fb]",
                    )}
                  >
                    <input type="checkbox" className="mt-0.5" checked={on} onChange={() => onPatch({ subjectIds: toggleId(t.subjectIds, s.id) })} />
                    <span>{s.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-black/[0.06] pt-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-[0.72rem] font-medium text-muted">Группы филиала</div>
          {groups.length ? (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <span key={g.id} className="rounded-full bg-[#f3f6fa] px-2.5 py-1 text-[0.75rem] text-fg">
                  {g.name.replace(/^2026\s+/, "")}
                  {g.age ? ` · ${g.age}` : ""}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[0.78rem] text-muted">Нет групп с этим предметом и длительностью в филиале.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {note ? <p className={cn("max-w-xs text-right text-[0.78rem]", /не |ошиб|сбой|сесс/i.test(note) ? "text-rose-700" : "text-primary")}>{note}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" className="h-9 px-4 text-[0.8rem] text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => void onDelete()}>Удалить</Button>
            <Button type="button" variant="secondary" className="h-9 px-4 text-[0.8rem]" disabled={busy} onClick={async () => {
              setNote("Сохраняю на сайте…");
              const res = await onSave();
              setNote(res && res.ok === false ? res.error || "Не сохранилось." : "Сохранено на сайте.");
            }}>Сохранить на сайте</Button>
            <Button type="button" className="h-9 px-4 text-[0.8rem]" disabled={busy} onClick={async () => {
              setNote("Выгружаю в AlfaCRM…");
              const res = await onPush();
              if (!res) {
                setNote("Нет ответа. Обновите страницу и войдите снова.");
                return;
              }
              if (res.ok) setNote("Выгружен в AlfaCRM.");
              else setNote(res.error || "Не выгрузилось в AlfaCRM.");
            }}>{busy ? "Выгружаю…" : "Выгрузить в AlfaCRM"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Предмет к строке цены: subjectId / courseId / path. Имя не склеивает. */
function matchSubject(row: PriceRow, subjects: { id: number; name: string; href?: string; courseId?: string }[]) {
  if (row.subjectId) {
    const byId = subjects.find((s) => s.id === row.subjectId);
    if (byId) return byId;
  }
  const path = String(row.courseId || row.path || "").replace(/\/+$/, "");
  if (!path) return null;
  return (
    subjects.find((s) => s.courseId && s.courseId.replace(/\/+$/, "") === path) ||
    subjects.find((s) => s.href && s.href.replace(/\/+$/, "") === path) ||
    null
  );
}

function TariffWizard({
  busy,
  tabs,
  typeList,
  subjectList,
  existing,
  onClose,
  onCreate,
}: {
  busy: boolean;
  tabs: CrmBranch[];
  typeList: CrmLessonType[];
  subjectList: { id: number; name: string; href?: string }[];
  existing: Row[];
  onClose: () => void;
  onCreate: (drafts: Row[], push: boolean) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [dir, setDir] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [packId, setPackId] = useState("none");
  const [column, setColumn] = useState("all");
  const [corps, setCorps] = useState<{ id: string; name: string }[]>([
    { id: "all", name: "Все" },
    { id: "kbm", name: "КБМ" },
    { id: "tmx", name: "ТМХ" },
  ]);
  const [branches, setBranches] = useState<number[]>([2, 1, 3]);
  const [lessonTypes, setLessonTypes] = useState<number[]>([2, 5, 10, 11]);
  const [nameWithSubject, setNameWithSubject] = useState(true);
  const [calcType, setCalcType] = useState(2);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await adminPrices({ data: { token: token() } });
      if (!res.ok) {
        setLoadErr(res.error || "Не удалось прочитать цены курсов.");
        return;
      }
      setRows(
        res.rows.filter(
          (r) =>
            Number(r.all) > 0 ||
            Number(r.kbm) > 0 ||
            Number(r.tmx) > 0 ||
            Object.values(r.extra || {}).some((n) => Number(n) > 0),
        ),
      );
      const form = await adminPriceFormulas({ data: { token: token(), action: "get" } });
      if (form.ok && "formulas" in form && form.formulas) {
        setCorps([
          { id: "all", name: "Все" },
          { id: "kbm", name: "КБМ" },
          { id: "tmx", name: "ТМХ" },
          ...(form.formulas.extra || []).map((c) => ({ id: c.id, name: c.name })),
        ]);
      }
    })();
  }, []);

  const visible = [...rows.filter((r) => !dir || r.direction === dir)].sort(
    (a, b) => a.name.localeCompare(b.name, "ru") || String(a.age || "").localeCompare(String(b.age || ""), "ru"),
  );
  const selected = visible.filter((r) => picked.has(r.path));
  const pack = PACKS.find((p) => p.id === packId) || PACKS[0];

  function togglePath(path: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

  function applyPack(id: string) {
    setPackId(id);
  }

  function pickSchool(next: string) {
    setDir(next);
    const list = rows.filter((r) => !next || r.direction === next);
    setPicked(new Set(list.map((r) => r.path)));
  }

  const drafts = useMemo(() => {
    return selected.map((row, i) => {
      const price =
        column === "all"
          ? Math.round(Number(row.all || 0))
          : column === "kbm"
            ? Math.round(Number(row.kbm || 0))
            : column === "tmx"
              ? Math.round(Number(row.tmx || 0))
              : Math.round(Number(row.extra?.[column] || 0));
      const mins = Math.max(0, Math.round(Number(row.mins) || 0));
      const perWeek = Math.max(0, Math.round(Number(row.perWeek) || 0));
      const packWeeks = Math.max(1, pack.weeks || 4);
      const lessons = perWeek > 0 ? perWeek * packWeeks : 0;
      const subject = matchSubject(row, subjectList);
      const titleAge = row.age ? ` (${row.age})` : "";
      const subjectTitle = subject?.name || `${row.name}${titleAge}`;
      const name = (
        nameWithSubject
          ? `Абонемент ${price}/${lessons}/${mins || "?"} ${subjectTitle}`
          : `Абонемент ${price}/${lessons}/${mins || "?"}`
      )
        .replace(/\s+/g, " ")
        .trim();
      const dup = existing.find(
        (t) =>
          t.id > 0 &&
          !t.archive &&
          t.price === price &&
          t.lessonsCount === lessons &&
          t.duration === mins &&
          (subject ? t.subjectIds.includes(subject.id) : t.name === name),
      );
      let warn = "";
      if (!price) warn = "цена 0 — пропустите или поправьте прайс";
      else if (!mins) warn = "нет минут в ценах курсов — сначала «Подгрузить из групп»";
      else if (!perWeek) warn = "нет «в неделю» в ценах — сначала «Подгрузить из групп»";
      else if (!subject) warn = "предмет в CRM не найден — привяжите вручную";
      else if (dup) warn = `похоже на №${dup.id}`;
      let h = 0;
      for (const ch of row.path) h = (h * 31 + ch.charCodeAt(0)) | 0;
      return {
        ...blank(branches[0] || 2),
        id: -(Math.abs(h) % 800000 + i + 1),
        name,
        price,
        lessonsCount: lessons,
        duration: mins,
        pricePerLesson: lessons ? Math.round((price / lessons) * 100) / 100 : 0,
        branchIds: branches.length ? branches : [2],
        subjectIds: subject ? [subject.id] : [],
        lessonTypeIds: lessonTypes,
        calculationType: calcType,
        calculationName: CALC_NAMES[calcType] || "Отдельный счет",
        periodCount: pack.period,
        periodType: pack.type,
        periodLabel: pack.period ? pack.label : "",
        bDate: "",
        eDate: "",
        groups: [],
        warn,
      } as Row;
    });
  }, [selected, column, pack, subjectList, existing, branches, lessonTypes, calcType, nameWithSubject]);

  const ready = drafts.filter((d) => d.price > 0 && d.lessonsCount > 0);

  return (
    <article className="rounded-[1.4rem] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.08)] ring-1 ring-primary/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl text-primary">Мастер абонементов студии</p>
          <p className="mt-0.5 text-sm text-muted">Цена, минуты и уроки в неделю — из цен курсов. Период действия — дни, недели или месяцы.</p>
        </div>
        <button type="button" className="text-sm text-muted hover:text-fg" onClick={onClose}>Закрыть</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[0.78rem]">
        {["Курсы", "Пакет", "Где действует", "Предпросмотр"].map((label, i) => (
          <span key={label} className={cn("rounded-full px-3 py-1", step === i + 1 ? "bg-primary text-white" : "bg-surface-2 text-muted")}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {loadErr ? <p className="mt-3 text-sm text-rose-700">{loadErr}</p> : null}

      {step === 1 ? (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-5 text-sm">
            <span className="shrink-0 text-muted">Школа</span>
            <select value={dir} onChange={(e) => pickSchool(e.target.value)} className="h-10 w-full max-w-md rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-black/10">
              <option value="">Все школы</option>
              {PRICE_DIRECTIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-3 text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => setPicked(new Set(visible.map((r) => r.path)))}>выбрать все</button>
            <button type="button" className="text-muted hover:underline" onClick={() => setPicked(new Set())}>снять</button>
            <span className="text-muted">отмечено {selected.length} из {visible.length}</span>
          </div>
          <div className="max-h-64 overflow-auto rounded-2xl ring-1 ring-black/10">
            {visible.map((r) => (
              <label key={r.path} className={cn("flex cursor-pointer items-center gap-3 border-b border-black/5 px-3 py-2 text-sm last:border-0", picked.has(r.path) && "bg-sky-50")}>
                <input type="checkbox" checked={picked.has(r.path)} onChange={() => togglePath(r.path)} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.name}</span>
                  {r.age ? <span className="ml-1 text-muted">{r.age}</span> : null}
                  <span className="mt-0.5 block text-[0.7rem] text-muted">{r.direction}</span>
                </span>
                <span className="shrink-0 text-right text-[0.72rem] tabular-nums text-muted">
                  <span className="block">{r.mins ? `${r.mins} мин` : "мин —"} · {r.perWeek ? `${r.perWeek}/нед` : "нед —"}</span>
                  <span className="font-medium text-fg">{money(r.all)}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[0.72rem] font-medium text-muted">Период действия — как в AlfaCRM</p>
            <div className="flex flex-wrap gap-1.5">
              {PACKS.map((p) => (
                <Chip key={p.id} on={packId === p.id} onClick={() => applyPack(p.id)}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-[0.7rem] text-muted">
              Цифра и единица: дни, недели или месяцы. Уроков в пакете = занятия в неделю × {pack.weeks}.
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-[0.72rem] font-medium text-muted">Минуты и нагрузка</p>
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
              Берутся автоматически из цен курсов. Если пусто — сначала в «Цены курсов» нажмите «Подгрузить из групп».
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-[0.72rem] font-medium text-muted">Брать цену из</p>
            <div className="flex flex-wrap gap-1.5">
              {corps.map((c) => (
                <Chip key={c.id} on={column === c.id} onClick={() => setColumn(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>
          <label className="sm:col-span-2 flex cursor-pointer items-start gap-2.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5" checked={nameWithSubject} onChange={(e) => setNameWithSubject(e.target.checked)} />
            <span>
              <span className="font-medium">Добавлять название предмета в имя абонемента</span>
              <span className="mt-0.5 block text-[0.7rem] text-muted">
                {nameWithSubject
                  ? "Например: Абонемент 2950/4/45 Художественная студия (3-4 лет)"
                  : "Например: Абонемент 2950/4/45 — без названия курса"}
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1.5 text-[0.72rem] font-medium text-muted">
              Филиалы
              <button type="button" className="ml-2 text-[0.7rem] text-primary" onClick={() => setBranches(tabs.map((b) => b.id))}>все</button>
              <button type="button" className="ml-2 text-[0.7rem] text-muted" onClick={() => setBranches([])}>снять</button>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tabs.map((b) => (
                <Chip key={b.id} on={branches.includes(b.id)} onClick={() => setBranches(toggleId(branches, b.id))}>{b.short}</Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[0.72rem] font-medium text-muted">Клиентский счёт</p>
            <div className="flex flex-wrap gap-1.5">
              {([[2, "Отдельный счёт"], [1, "Базовый счёт"], [0, "Любой"]] as const).map(([id, label]) => (
                <Chip key={id} on={calcType === id} onClick={() => setCalcType(id)}>{label}</Chip>
              ))}
            </div>
            <p className="mt-1.5 text-[0.7rem] text-muted">
              Отдельный — остаток занятий только у этого абонемента. Базовый — общий счёт клиента на все курсы. По умолчанию — отдельный.
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-[0.72rem] font-medium text-muted">Типы уроков</p>
            <div className="flex flex-wrap gap-1.5">
              {typeList.map((lt) => (
                <Chip key={lt.id} on={lessonTypes.includes(lt.id)} onClick={() => setLessonTypes(toggleId(lessonTypes, lt.id))}>{lt.name}</Chip>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="mt-4">
          <p className="text-sm text-muted">
            Будет создано {ready.length} абонементов. Минуты и «в неделю» — из цен курсов. Срок: {pack.label}. Счёт: {CALC_NAMES[calcType] || "Отдельный счет"}. Филиалы: {tabs.filter((b) => branches.includes(b.id)).map((b) => b.short).join(", ") || "—"}.
            {column === "all" ? " Цена «Все»." : ` Цена ${corps.find((c) => c.id === column)?.name || column}.`}
          </p>
          <div className="mt-2 max-h-72 overflow-auto rounded-2xl ring-1 ring-black/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-[0.68rem] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2">Название</th>
                  <th className="px-3 py-2">Цена</th>
                  <th className="px-3 py-2">Мин</th>
                  <th className="px-3 py-2">Зан.</th>
                  <th className="px-3 py-2">Предмет</th>
                  <th className="px-3 py-2">Счёт</th>
                  <th className="px-3 py-2">Период</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id} className="border-t border-black/6">
                    <td className="px-3 py-2">{d.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{money(d.price)}</td>
                    <td className="px-3 py-2 tabular-nums">{d.duration || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{d.lessonsCount || "—"}</td>
                    <td className="px-3 py-2">
                      {d.subjectIds.length ? subjectList.find((s) => s.id === d.subjectIds[0])?.name : <span className="text-rose-600">нет</span>}
                      {(d as Row & { warn?: string }).warn ? <div className="text-[0.7rem] text-amber-700">{(d as Row & { warn?: string }).warn}</div> : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{CALC_NAMES[d.calculationType] || "Любой"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{d.periodCount ? `${d.periodCount} ${PERIOD_UNITS.find((u) => u.id === d.periodType)?.name || ""}`.trim() : "не задан"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" className="h-9 px-4 text-sm" onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}>
          {step === 1 ? "Отмена" : "Назад"}
        </Button>
        {step < 4 ? (
          <Button type="button" className="h-9 px-4 text-sm" disabled={step === 1 && !selected.length} onClick={() => setStep((s) => s + 1)}>
            Далее
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="h-9 px-4 text-sm" disabled={busy || !ready.length} onClick={() => void onCreate(ready, false)}>
              Создать на сайте
            </Button>
            <Button type="button" className="h-9 px-4 text-sm" disabled={busy || !ready.length || !branches.length} onClick={() => void onCreate(ready, true)}>
              Создать и выгрузить в CRM
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
