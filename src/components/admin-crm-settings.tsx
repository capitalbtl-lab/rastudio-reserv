"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { CRM_STAGE_COLORS, LEAD_STAGES, mergeStages, pinUnsorted, type LeadStage } from "@/data/crm-leads-stages";
import { FUNNEL_AUTO_DEFAULT, type FunnelAuto } from "@/data/funnel-auto-core";
import { CRM_BRANCH } from "@/data/ids";
import { cn } from "@/lib/utils";
import { CRM_ACTORS, type CrmActorsState } from "@/data/crm-actors";
import { CACHE_KIND_META, type CacheKind, type CachePolicy } from "@/data/crm-cache-policy-core";

export const CRM_SYNC_MIN_KEY = "ra_crm_sync_min";

export function crmSyncMinutes() {
  if (typeof window === "undefined") return 10;
  const n = Number(localStorage.getItem(CRM_SYNC_MIN_KEY) || 10);
  return Number.isFinite(n) ? Math.max(2, Math.min(60, n)) : 10;
}

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.2rem] bg-white p-4 ring-1 ring-black/8 md:p-5">
      <h3 className="font-display text-[1.2rem] leading-tight">{title}</h3>
      {hint ? <p className="mt-1 text-[0.82rem] text-muted">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function AdminCrmSettings() {
  const [stages, setStages] = useState<LeadStage[]>(LEAD_STAGES);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [addName, setAddName] = useState("");
  const [addColor, setAddColor] = useState("#1a7bb9");
  const [syncMin, setSyncMin] = useState(10);
  const [auto, setAuto] = useState<FunnelAuto>(FUNNEL_AUTO_DEFAULT);
  const [cache, setCache] = useState<CachePolicy | null>(null);
  const [actors, setActors] = useState<CrmActorsState | null>(null);
  const [humanName, setHumanName] = useState("Администратор");
  const [queue, setQueue] = useState<{ pending?: number; lastNote?: string; overlayNext?: number; overlayTotal?: number; busy?: boolean; exportPending?: number } | null>(null);
  const dragId = useRef(0);

  useEffect(() => {
    setSyncMin(crmSyncMinutes());
    void loadStages();
    void loadAuto();
    void loadCache();
    void loadActors();
  }, []);

  async function loadAuto() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "funnelAutoGet" } as never,
      })) as { ok?: boolean; rules?: FunnelAuto };
      if (res.ok && res.rules) setAuto(res.rules);
    } catch {
      /* defaults */
    }
  }

  async function saveAuto(next: FunnelAuto) {
    setAuto(next);
    const res = (await adminSchedule({
      data: { token: token(), action: "funnelAutoSave", funnelAuto: next } as never,
    })) as { ok?: boolean; rules?: FunnelAuto; error?: string };
    if (res.ok && res.rules) {
      setAuto(res.rules);
      setMsg("Автоматизация записана.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить автоматизацию.");
  }

  async function loadCache() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "cachePolicyGet" } as never,
      })) as { ok?: boolean; policy?: CachePolicy; queue?: typeof queue };
      if (res.ok && res.policy) setCache(res.policy);
      if (res.ok && res.queue) setQueue(res.queue);
    } catch {
      /* defaults */
    }
  }

  async function saveCache(next: CachePolicy) {
    setCache(next);
    const res = (await adminSchedule({
      data: { token: token(), action: "cachePolicySave", cachePolicy: next } as never,
    })) as { ok?: boolean; policy?: CachePolicy; error?: string };
    if (res.ok && res.policy) {
      setCache(res.policy);
      setMsg("Кэш сайта записан.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить кэш.");
  }

  async function loadActors() {
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "actorsGet" } as never,
      })) as { ok?: boolean; humanName?: string; actors?: CrmActorsState["actors"] };
      if (res.ok) {
        setActors({
          humanName: res.humanName || "Администратор",
          actors: res.actors?.length ? res.actors : CRM_ACTORS,
        });
        setHumanName(res.humanName || "Администратор");
      }
    } catch {
      setActors({ humanName: "Администратор", actors: CRM_ACTORS });
    }
  }

  async function saveActorsName() {
    const res = (await adminSchedule({
      data: { token: token(), action: "actorsSave", humanName } as never,
    })) as { ok?: boolean; humanName?: string; actors?: CrmActorsState["actors"]; error?: string };
    if (res.ok) {
      setActors({ humanName: res.humanName || humanName, actors: res.actors?.length ? res.actors : CRM_ACTORS });
      setMsg("Роли записаны.");
      return;
    }
    setMsg(res.error || "Не удалось сохранить роли.");
  }

  async function tickQueue(force: boolean) {
    setBusy(true);
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "crmQueueTick", force } as never,
      })) as { ok?: boolean; extra?: string; queue?: typeof queue; error?: string; live?: number };
      if (res.queue) setQueue(res.queue);
      setMsg(res.error || res.extra || (res.ok ? `Пакет прошёл${res.live != null ? `, живых ${res.live}` : ""}` : "Очередь не ответила."));
      await loadCache();
    } finally {
      setBusy(false);
    }
  }

  async function loadStages() {
    setBusy(true);
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "leadsBoard", branchId: 2, force: false } as never,
      })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
      if (res.ok && Array.isArray(res.stages) && res.stages.length) {
        setStages(mergeStages(res.stages));
        setMsg("");
      } else if (res.error) setMsg(res.error);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось прочитать этапы.");
    } finally {
      setBusy(false);
    }
  }

  async function sortStages(ids: number[]) {
    const pinned = pinUnsorted(ids);
    const prev = stages;
    setStages((xs) => {
      const by = new Map(xs.map((s) => [s.id, s]));
      const next = pinned.map((id) => by.get(id)).filter((s): s is LeadStage => Boolean(s));
      for (const s of xs) if (!next.some((x) => x.id === s.id)) next.push(s);
      return next;
    });
    setMsg("Записываю порядок в AlfaCRM…");
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageSort", stageIds: pinned, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    if (res.ok && Array.isArray(res.stages)) {
      setStages(mergeStages(res.stages));
      setMsg("Порядок записан в AlfaCRM.");
      return;
    }
    setStages(prev);
    setMsg(res.error || "AlfaCRM не приняла порядок.");
  }

  function shift(id: number, dir: -1 | 1) {
    if (id === 0) return;
    const ids = stages.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length || ids[j] === 0) return;
    const next = ids.slice();
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    void sortStages(next);
  }

  async function saveName(id: number, name: string) {
    const title = name.trim();
    setEditId(null);
    if (!title || id === 0) return;
    const prev = stages.find((s) => s.id === id)?.name;
    if (title === prev) return;
    setStages((xs) => xs.map((s) => (s.id === id ? { ...s, name: title } : s)));
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageSave", stageId: id, name: title, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    if (res.ok && Array.isArray(res.stages)) setStages(mergeStages(res.stages));
    else setMsg(res.error || "Не удалось переименовать этап.");
  }

  async function saveColor(id: number, color: string) {
    if (id === 0) return;
    setStages((xs) => xs.map((s) => (s.id === id ? { ...s, color } : s)));
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageSave", stageId: id, color, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    if (res.ok && Array.isArray(res.stages)) setStages(mergeStages(res.stages));
    else setMsg(res.error || "Не удалось сменить цвет.");
  }

  async function addStage() {
    const title = addName.trim();
    if (!title) return;
    setBusy(true);
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageCreate", name: title, color: addColor, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    setBusy(false);
    if (res.ok && Array.isArray(res.stages)) {
      setStages(mergeStages(res.stages));
      setAddName("");
      setMsg(`Этап «${title}» добавлен.`);
      return;
    }
    setMsg(res.error || "Не удалось создать этап.");
  }

  async function removeStage(id: number, name: string) {
    if (id === 0) return;
    if (!window.confirm(`Удалить этап «${name}» в AlfaCRM? Лиды с него уйдут в «Не разобрано».`)) return;
    setBusy(true);
    const res = (await adminSchedule({
      data: { token: token(), action: "leadStageDelete", stageId: id, branchId: 2 } as never,
    })) as { ok?: boolean; stages?: LeadStage[]; error?: string };
    setBusy(false);
    if (res.ok && Array.isArray(res.stages)) {
      setStages(mergeStages(res.stages));
      setMsg(`Этап «${name}» удалён.`);
      return;
    }
    setMsg(res.error || "Не удалось удалить этап.");
  }

  function setMinutes(n: number) {
    const v = Math.max(2, Math.min(60, n));
    setSyncMin(v);
    try {
      localStorage.setItem(CRM_SYNC_MIN_KEY, String(v));
    } catch {
      /* */
    }
  }

  const named = stages.filter((s) => s.id !== 0);
  const unsorted = stages.find((s) => s.id === 0) || LEAD_STAGES[0];

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h2 className="font-display text-3xl">Настройка CRM</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Этапы воронки, автоматизация и синхронизация с AlfaCRM. Порядок столбцов здесь — тот же, что в кабинете CRM и на доске лидов.
        </p>
      </div>

      <Card
        title="Люди и роли"
        hint="Кто пишет на диск. Alfa догоняет очередью и не меняет автора. Пароль кабинета один — сотрудник. Два ИИ без пароля: ассистент в админке, консультант на сайте. Очередь — пакеты cgi и выгрузка."
      >
        <ul className="space-y-2">
          {(actors?.actors || CRM_ACTORS).map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <span className="mt-1 rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {a.kind === "human" ? "человек" : a.kind === "ai" ? "ИИ" : "система"}
              </span>
              <div className="min-w-[12rem] flex-1">
                {a.id === "human" ? (
                  <label className="block text-sm font-semibold">
                    Сотрудник
                    <input
                      value={humanName}
                      onChange={(e) => setHumanName(e.target.value)}
                      onBlur={() => void saveActorsName()}
                      className="mt-1 h-9 w-full rounded-full bg-white px-3 text-sm font-medium ring-1 ring-black/8"
                    />
                  </label>
                ) : (
                  <p className="text-sm font-semibold">{a.name}</p>
                )}
                <p className="mt-0.5 text-[0.75rem] text-muted">{a.hint}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.75rem] text-muted">Пароль входа тот же. Несколько сотрудников — следующим шагом, не смешивать с ИИ.</p>
      </Card>

      <Card
        title="Воронка продаж"
        hint="Как в AlfaCRM: Настройки → Воронки продаж. «Не разобрано» системный, его нельзя сдвинуть. Остальные — перетащите или кнопками вверх/вниз."
      >
        <div className="overflow-hidden rounded-xl ring-1 ring-black/8">
          <table className="w-full text-left">
            <thead className="bg-black/[0.03] text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-2 py-2">Этап</th>
                <th className="px-2 py-2">Цвет</th>
                <th className="px-2 py-2 text-right">ID</th>
                <th className="px-2 py-2 text-right">Порядок</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-black/6 bg-black/[0.02]">
                <td className="px-3 py-2 text-center text-muted">—</td>
                <td className="px-2 py-2 text-[0.88rem] font-semibold" style={{ color: unsorted.color }}>
                  {unsorted.name}
                  <span className="ml-2 text-[0.72rem] font-normal text-muted">системный</span>
                </td>
                <td className="px-2 py-2">
                  <span className="inline-block h-4 w-4 rounded-full ring-1 ring-black/15" style={{ background: unsorted.color }} />
                </td>
                <td className="px-2 py-2 text-right text-[0.8rem] text-muted">0</td>
                <td className="px-2 py-2 text-right text-[0.75rem] text-muted">фиксирован</td>
              </tr>
              {named.map((col) => (
                <tr
                  key={col.id}
                  draggable
                  onDragStart={(e) => {
                    dragId.current = col.id;
                    e.dataTransfer.setData("text/plain", String(col.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain") || dragId.current);
                    if (!from || from === col.id) return;
                    const ids = stages.map((s) => s.id).filter((id) => id !== from);
                    const at = ids.indexOf(col.id);
                    if (at < 0) return;
                    ids.splice(at, 0, from);
                    void sortStages(ids);
                  }}
                  className="cursor-grab border-t border-black/6 hover:bg-black/[0.03] active:cursor-grabbing"
                >
                  <td className="px-3 py-2 text-center text-muted">⇅</td>
                  <td className="px-2 py-2">
                    {editId === col.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => void saveName(col.id, editName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="h-8 w-full max-w-[16rem] rounded-lg bg-white px-2 text-[0.88rem] font-semibold ring-1 ring-black/10"
                      />
                    ) : (
                      <button
                        type="button"
                        className="text-left text-[0.88rem] font-semibold hover:underline"
                        style={{ color: col.color }}
                        onClick={() => {
                          setEditId(col.id);
                          setEditName(col.name);
                        }}
                      >
                        {col.name}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className="inline-flex gap-1">
                      {CRM_STAGE_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          title={c.hex}
                          onClick={() => void saveColor(col.id, c.hex)}
                          className={cn(
                            "h-4 w-4 rounded-full ring-1 ring-black/15",
                            col.color.toLowerCase() === c.hex.toLowerCase() && "ring-2 ring-fg",
                          )}
                          style={{ background: c.hex }}
                        />
                      ))}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-[0.8rem] text-muted">{col.id}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      className="mr-1 rounded-md px-2 py-0.5 text-[0.75rem] font-semibold ring-1 ring-black/10 hover:bg-black/5"
                      onClick={() => shift(col.id, -1)}
                    >
                      вверх
                    </button>
                    <button
                      type="button"
                      className="mr-1 rounded-md px-2 py-0.5 text-[0.75rem] font-semibold ring-1 ring-black/10 hover:bg-black/5"
                      onClick={() => shift(col.id, 1)}
                    >
                      вниз
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2 py-0.5 text-[0.75rem] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
                      onClick={() => void removeStage(col.id, col.name)}
                    >
                      удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block min-w-[12rem] flex-1">
            <span className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">Новый этап</span>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addStage();
              }}
              placeholder="Например: Запись на пробное"
              className="mt-1 h-10 w-full rounded-full bg-surface-2 px-3 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/35"
            />
          </label>
          <span className="inline-flex items-center gap-1 pb-2">
            {CRM_STAGE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setAddColor(c.hex)}
                className={cn("h-5 w-5 rounded-full ring-1 ring-black/15", addColor === c.hex && "ring-2 ring-fg")}
                style={{ background: c.hex }}
              />
            ))}
          </span>
          <button
            type="button"
            disabled={busy || !addName.trim()}
            onClick={() => void addStage()}
            className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40"
          >
            Добавить в CRM
          </button>
        </div>
        {msg ? <p className={cn("mt-3 text-sm font-semibold", msg.includes("не") || msg.includes("Не") ? "text-rose-700" : "text-emerald-800")}>{msg}</p> : null}
      </Card>

      <Card
        title="Автоматизация воронки продаж"
        hint="Сайт и карточка сами двигают этап в AlfaCRM. Ученика (is_study=1) и архив не трогает. С «Оплатил» назад в группу не возвращает."
      >
        <ul className="space-y-3">
          {(
            [
              ["siteOn", "siteStageId", "Заявка с сайта", "Форма пробного и ассистент"],
              ["groupOn", "groupStageId", "Добавили в группу", "Карточка клиента → группа"],
              ["tariffOn", "tariffStageId", "Абонемент или оплата", "Выдали абонемент или провели платёж"],
            ] as const
          ).map(([onKey, stageKey, title, hint]) => (
            <li key={onKey} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={auto[onKey]}
                onClick={() => void saveAuto({ ...auto, [onKey]: !auto[onKey] })}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition",
                  auto[onKey] ? "bg-primary" : "bg-black/15",
                )}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow", auto[onKey] ? "left-5" : "left-0.5")} />
              </button>
              <div className="min-w-[10rem] flex-1">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-[0.75rem] text-muted">{hint}</p>
              </div>
              <select
                className="h-9 rounded-full bg-white px-3 text-sm ring-1 ring-black/8"
                disabled={!auto[onKey]}
                value={auto[stageKey]}
                onChange={(e) => void saveAuto({ ...auto, [stageKey]: Number(e.target.value) })}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={auto.skipIfPaid}
            onChange={(e) => void saveAuto({ ...auto, skipIfPaid: e.target.checked })}
          />
          Не возвращать с «Оплатил», если снова добавили в группу
        </label>
      </Card>

      <Card
        title="Кэш сайта"
        hint="Что читать из хранилища админки, а что каждый раз из AlfaCRM. Оперативные данные — на лету. Абонементы учеников: счётчик сразу с диска сайта, без пакетов. Сверка CRM — фоном по филиалам."
      >
        <ul className="space-y-2">
          {CACHE_KIND_META.map((k) => {
            const rule = cache?.rules[k.id as CacheKind] || { cache: true, ttlMin: 10 };
            return (
              <li key={k.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.cache}
                  title={rule.cache ? "Читать из кэша сайта" : "Всегда из CRM"}
                  onClick={() =>
                    cache &&
                    void saveCache({
                      ...cache,
                      rules: { ...cache.rules, [k.id]: { ...rule, cache: !rule.cache } },
                    })
                  }
                  className={cn("relative h-6 w-11 shrink-0 rounded-full transition", rule.cache ? "bg-primary" : "bg-black/15")}
                >
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow", rule.cache ? "left-5" : "left-0.5")} />
                </button>
                <div className="min-w-[12rem] flex-1">
                  <p className="text-sm font-semibold">{k.title}</p>
                  <p className="text-[0.75rem] text-muted">{k.hint}</p>
                  <p className="text-[0.72rem] text-muted">{rule.cache ? `кэш ${rule.ttlMin} мин · ${k.liveHint}` : `на лету · ${k.liveHint}`}</p>
                </div>
                <label className="text-[0.75rem] text-muted">
                  TTL
                  <select
                    className="ml-2 h-9 rounded-full bg-white px-3 text-sm text-fg ring-1 ring-black/8"
                    disabled={!rule.cache}
                    value={rule.ttlMin}
                    onChange={(e) =>
                      cache &&
                      void saveCache({
                        ...cache,
                        rules: { ...cache.rules, [k.id]: { ...rule, ttlMin: Number(e.target.value) } },
                      })
                    }
                  >
                    {[5, 10, 15, 30, 60, 120].map((n) => (
                      <option key={n} value={n}>
                        {n} мин
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
        {cache?.overlayAt ? (
          <p className="mt-3 text-[0.75rem] text-muted">
            Последняя сверка абонементов: {new Date(cache.overlayAt).toLocaleString("ru-RU")}
            {cache.overlayTotal ? ` · ${cache.overlayNext}/${cache.overlayTotal} групп` : ""}
            {queue?.exportPending ? ` · выгрузка в Alfa ${queue.exportPending}` : ""}
            {queue?.pending && !queue.exportPending ? ` · в очереди ${queue.pending}` : ""}
            {queue?.lastNote ? ` · ${queue.lastNote}` : ""}
          </p>
        ) : (
          <p className="mt-3 text-[0.75rem] text-muted">
            Сверки абонементов ещё не было — пакеты идут сами, вкладка Клиенты их не обязана держать открытой.
            {queue?.exportPending ? ` Выгрузка в Alfa: ${queue.exportPending}.` : ""}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-9 rounded-full bg-black/8 px-4 text-sm"
            disabled={busy}
            onClick={() => void tickQueue(false)}
          >
            Пакет сейчас
          </button>
          <button
            type="button"
            className="h-9 rounded-full bg-black/8 px-4 text-sm"
            disabled={busy}
            onClick={() => void tickQueue(true)}
          >
            Круг с начала
          </button>
        </div>
      </Card>

      <Card
        title="Синхронизация лидов"
        hint="Правки в AlfaCRM подтягиваются не целиком, а только по изменённым карточкам. Полная доска — кнопкой на вкладке Клиенты."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold">
            Сверять CRM каждые
            <select
              className="ml-2 h-9 rounded-full bg-surface-2 px-3 text-sm ring-1 ring-black/8"
              value={syncMin}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[5, 10, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} мин
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadStages()}
            className="h-9 rounded-full px-3 text-sm font-semibold ring-1 ring-black/10 hover:bg-black/5"
          >
            Обновить этапы
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-[0.82rem] text-muted">
          <li>Доска лидов с диска сайта. F5 не ходит в AlfaCRM.</li>
          <li>Фон читает только записи с новым updated_at — остальные не трогает.</li>
          <li>Полная сверка — кнопка «Обновить» на вкладке Клиенты.</li>
        </ul>
      </Card>

      <Card title="Филиалы" hint="Лиды и клиенты в AlfaCRM привязаны к филиалу. На сайте тот же список.">
        <ul className="divide-y divide-black/6">
          {([1, 2, 3, 4] as const).map((id) => (
            <li key={id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-semibold">{CRM_BRANCH[id]?.short}</span>
                <span className="ml-2 text-muted">{CRM_BRANCH[id]?.name}</span>
              </span>
              <span className="tabular-nums text-muted">ID {id}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Какие карточки попадают в воронку">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Новая заявка</dt>
            <dd className="mt-1 text-muted">is_study = 0, обычно сразу этап «Разбирается». Появляется и в API, и на доске CRM.</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Клиент → «Сделать лидом»</dt>
            <dd className="mt-1 text-muted">Пишем is_study=0 и помечаем «на воронке». Список клиентов сразу убирает карточку, воронка — берёт. Если Alfa оставила is_study=1, сайт всё равно считает лидом.</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Архив</dt>
            <dd className="mt-1 text-muted">is_study = 2 или removed. С воронки снимается, кнопка «Загрузить архив» на вкладке Клиенты.</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="font-semibold">Ключ API</dt>
            <dd className="mt-1 text-muted">Хост, почта и ключ v2api — в разделе ключей интеграций (AlfaCRM). Без них воронка не читается.</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}