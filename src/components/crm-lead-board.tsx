"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CRM_BRANCH } from "@/data/ids";
import { LEAD_STAGES, type LeadCard, type LeadStage } from "@/data/crm-leads";
import { RA_POP } from "@/data/admin-ui";
import { cn } from "@/lib/utils";

const COLS_KEY = "ra_lead_cols";

function when(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const d = new Date(s.includes("T") || s.includes("-") ? s : s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) {
    const m = s.match(/(\d{2})\.(\d{2})/);
    return m ? `${m[1]}.${m[2]}` : "";
  }
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function leadKey(it: LeadCard) {
  return `${it.branchId}:${it.id}`;
}

function readColOrder(ids: number[]) {
  try {
    const raw = JSON.parse(localStorage.getItem(COLS_KEY) || "[]") as number[];
    if (!Array.isArray(raw) || !raw.length) return ids;
    const seen = new Set<number>();
    const next: number[] = [];
    for (const id of raw.map(Number)) {
      if (!ids.includes(id) || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    for (const id of ids) if (!seen.has(id)) next.push(id);
    return next;
  } catch {
    return ids;
  }
}

function CardFace({
  it,
  color,
  hideBranch,
  onArchive,
}: {
  it: LeadCard;
  color: string;
  hideBranch?: boolean;
  onArchive?: (lead: LeadCard) => void;
}) {
  return (
    <>
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold" style={{ color }}>
          {it.name}
        </span>
        {onArchive ? (
          <button
            type="button"
            data-lead-del="1"
            data-no-drag="1"
            title="В архив AlfaCRM"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onArchive(it);
            }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted hover:bg-rose-50 hover:text-rose-600"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M9 7V5h6v2m-8 0 1 12h8l1-12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </span>
      <span className="mt-0.5 flex items-center justify-between gap-2 text-[0.68rem] text-muted">
        <span>{it.age || " "}</span>
        <span className="tabular-nums">{when(it.at)}</span>
      </span>
      {it.note ? <span className="mt-1 line-clamp-3 text-[0.72rem] leading-snug text-fg/80">{it.note}</span> : null}
      {it.phone ? <span className="mt-1 block truncate text-[0.7rem] text-muted">{it.phone}</span> : null}
      <span className="mt-1 flex flex-wrap items-center gap-1 text-[0.68rem] text-muted">
        {!hideBranch && CRM_BRANCH[it.branchId]?.short ? (
          <span className="rounded-full bg-surface-2 px-1.5 py-0.5">{CRM_BRANCH[it.branchId]?.short}</span>
        ) : null}
        {it.assigned ? <span className="truncate">{it.assigned}</span> : <span>не закреплён</span>}
      </span>
    </>
  );
}

type Drag =
  | { kind: "card"; key: string; lead: LeadCard; from: number }
  | { kind: "col"; id: number };

export function CrmLeadBoard({
  stages,
  items,
  activeId,
  hideBranch,
  onOpen,
  onMove,
  onArchive,
  onRenameStage,
  onDeleteStage,
}: {
  stages: LeadStage[];
  items: LeadCard[];
  activeId?: number;
  hideBranch?: boolean;
  onOpen: (lead: LeadCard) => void;
  onMove?: (lead: LeadCard, statusId: number, beforeId?: number) => void;
  onArchive?: (lead: LeadCard) => void;
  onRenameStage?: (id: number, name: string) => void;
  onDeleteStage?: (id: number) => void;
}) {
  const base = stages.length ? stages : LEAD_STAGES;
  const ids = base.map((s) => s.id);
  const [colOrder, setColOrder] = useState<number[]>(ids);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overCol, setOverCol] = useState<number | null>(null);
  const [overKey, setOverKey] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, setPending] = useState<LeadCard | null>(null);
  const [order, setOrder] = useState<Record<number, string[]>>({});
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const overRef = useRef<{ col: number | null; key: string }>({ col: null, key: "" });
  const liveRef = useRef(false);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const colOrderRef = useRef(colOrder);
  colOrderRef.current = colOrder;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => setColOrder(readColOrder(ids)), [ids.join(",")]);

  const cols = colOrder.map((id) => base.find((s) => s.id === id)).filter((s): s is LeadStage => Boolean(s));

  function persistCols(next: number[]) {
    setColOrder(next);
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(next));
    } catch {
      /* */
    }
  }

  function placeInCol(lead: LeadCard, colId: number, beforeId?: number) {
    const moving = leadKey(lead);
    setOrder((prev) => {
      const next = { ...prev };
      if (lead.statusId !== colId) {
        next[lead.statusId] = (next[lead.statusId] || []).filter((k) => k !== moving);
      }
      const present = itemsRef.current.filter((x) => x.statusId === colId && leadKey(x) !== moving).map(leadKey);
      const keep = (next[colId] || present).filter((k) => k !== moving && present.includes(k));
      for (const k of present) if (!keep.includes(k)) keep.push(k);
      const beforeHit = beforeId ? itemsRef.current.find((x) => x.id === beforeId && leadKey(x) !== moving) : null;
      const at = beforeHit ? keep.indexOf(leadKey(beforeHit)) : -1;
      if (at >= 0) keep.splice(at, 0, moving);
      else keep.push(moving);
      next[colId] = keep;
      return next;
    });
  }

  function cardsOf(colId: number) {
    const raw = items.filter((it) => it.statusId === colId);
    const keys = order[colId];
    if (!keys?.length) return raw;
    const rank = new Map(keys.map((k, i) => [k, i]));
    return [...raw].sort((a, b) => (rank.get(leadKey(a)) ?? 1e6) - (rank.get(leadKey(b)) ?? 1e6));
  }

  function hit(x: number, y: number) {
    const root = boardRef.current;
    if (!root) return { col: null as number | null, key: "" };
    const stack = document.elementsFromPoint(x, y) as HTMLElement[];
    let col: number | null = null;
    let key = "";
    for (const el of stack) {
      if (!el || el.dataset?.ghost === "1") continue;
      if (!key && el.dataset?.cardKey) key = el.dataset.cardKey;
      const colEl = el.closest?.("[data-col-id]") as HTMLElement | null;
      if (colEl && col == null) {
        col = Number(colEl.dataset.colId);
        break;
      }
    }
    if (col == null) {
      const sections = root.querySelectorAll<HTMLElement>("section[data-col-id]");
      let best = Infinity;
      for (const sec of sections) {
        const r = sec.getBoundingClientRect();
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        const d = dx + dy * 0.25;
        if (d < best) {
          best = d;
          col = Number(sec.dataset.colId);
        }
      }
    }
    if (col != null && !key) {
      const cards = root.querySelectorAll<HTMLElement>(`section[data-col-id="${col}"] [data-card-key]`);
      for (const el of cards) {
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          key = el.dataset.cardKey || "";
          break;
        }
      }
    }
    return { col, key };
  }

  function finish(commit: boolean) {
    const current = dragRef.current;
    const dest = overRef.current;
    liveRef.current = false;
    dragRef.current = null;
    overRef.current = { col: null, key: "" };
    setDrag(null);
    setOverCol(null);
    setOverKey("");
    document.body.classList.remove("ra-lead-dragging");
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    document.body.style.touchAction = "";
    if (!commit || !current) return;
    if (current.kind === "card") {
      if (dest.col == null) return;
      const ontoSelf = dest.col === current.from && dest.key === current.key;
      if (ontoSelf) return;
      const before = dest.key ? Number(dest.key.split(":")[1] || 0) : 0;
      const beforeId = before && before !== current.lead.id ? before : undefined;
      placeInCol(current.lead, dest.col, beforeId);
      onMoveRef.current?.(current.lead, dest.col, beforeId);
      return;
    }
    if (dest.col != null && dest.col !== current.id) {
      const next = [...colOrderRef.current];
      const i = next.indexOf(current.id);
      const j = next.indexOf(dest.col);
      if (i >= 0 && j >= 0) {
        next.splice(i, 1);
        next.splice(j, 0, current.id);
        persistCols(next);
      }
    }
  }

  function startPointer(e: React.PointerEvent, next: Drag) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest?.("[data-lead-del],[data-no-drag]")) return;
    e.stopPropagation();
    const originX = e.clientX;
    const originY = e.clientY;
    const pid = e.pointerId;
    liveRef.current = false;
    dragRef.current = next;
    overRef.current = { col: next.kind === "card" ? next.from : next.id, key: next.kind === "card" ? next.key : "" };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (!liveRef.current) {
        if (dx * dx + dy * dy < 25) return;
        liveRef.current = true;
        setDrag(next);
        document.body.classList.add("ra-lead-dragging");
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        document.body.style.touchAction = "none";
      }
      ev.preventDefault();
      setGhostPos({ x: ev.clientX, y: ev.clientY });
      const at = hit(ev.clientX, ev.clientY);
      if (at.col !== overRef.current.col || at.key !== overRef.current.key) {
        overRef.current = at;
        setOverCol(at.col);
        setOverKey(at.key);
      }
    };
    const stop = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
      window.removeEventListener("pointercancel", stop, true);
      const started = liveRef.current;
      if (!started) {
        dragRef.current = null;
        if (next.kind === "card") onOpenRef.current(next.lead);
        return;
      }
      finish(ev.type === "pointerup");
    };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", stop, { capture: true });
    window.addEventListener("pointercancel", stop, { capture: true });
  }

  const draggingCard = drag?.kind === "card" ? drag : null;

  return (
    <div ref={boardRef} className="pretty-scroll relative flex min-h-0 flex-1 gap-3 overflow-x-auto p-1">
      {cols.map((col) => {
        const list = cardsOf(col.id);
        const hot = overCol === col.id && Boolean(draggingCard);
        return (
          <section
            key={col.id}
            data-col-id={col.id}
            className={cn(
              "flex min-h-0 min-w-[16.5rem] flex-1 flex-col rounded-[1.2rem] bg-white/80 ring-1 ring-black/6 transition-[box-shadow,background-color] duration-150",
              hot && "bg-primary/[0.08] shadow-[0_0_0_2px_var(--color-primary,#2563eb)]",
            )}
          >
            <header
              data-col-id={col.id}
              onPointerDown={(e) => startPointer(e, { kind: "col", id: col.id })}
              className="flex cursor-grab items-center justify-between gap-2 px-3 py-2.5 active:cursor-grabbing"
              style={{ color: col.color }}
            >
              <p className="flex min-w-0 items-center gap-2 truncate text-[0.82rem] font-semibold">
                <span className="grid h-5 w-3.5 shrink-0 grid-cols-2 content-center gap-0.5 opacity-45" aria-hidden>
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                  <span className="h-1 w-1 rounded-full bg-current" />
                </span>
                {editId === col.id ? (
                  <input
                    autoFocus
                    data-no-drag="1"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => {
                      const next = editName.trim();
                      setEditId(null);
                      if (next && next !== col.name) onRenameStage?.(col.id, next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditId(null);
                    }}
                    className="h-6 min-w-0 flex-1 rounded bg-white px-1 text-[0.82rem] font-semibold text-fg ring-1 ring-black/10"
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="min-w-0 truncate"
                    title="Двойной клик — переименовать в AlfaCRM"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditId(col.id);
                      setEditName(col.name);
                    }}
                  >
                    {col.name}
                  </span>
                )}
              </p>
              <span className="flex items-center gap-1" data-no-drag="1">
                {onDeleteStage && col.id !== 0 ? (
                  <button
                    type="button"
                    title="Удалить столбец в AlfaCRM"
                    className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-rose-50 hover:text-rose-600"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Удалить столбец «${col.name}» в AlfaCRM?`)) onDeleteStage(col.id);
                    }}
                  >
                    ×
                  </button>
                ) : null}
                <span className="tabular-nums text-[0.75rem] opacity-70">{list.length}</span>
              </span>
            </header>
            <ul data-col-id={col.id} className="pretty-scroll min-h-[8rem] flex-1 space-y-1.5 overflow-y-auto px-2.5 pb-2.5 pt-1.5">
              {hot && draggingCard && !overKey ? <li className="h-2 rounded-full bg-primary/50" /> : null}
              {list.length ? (
                list.map((it) => {
                  const key = leadKey(it);
                  const on = activeId === it.customerId || activeId === it.id;
                  const lifting = draggingCard?.key === key;
                  return (
                    <li key={key} data-card-key={key} data-col-id={col.id}>
                      {overKey === key && draggingCard && draggingCard.key !== key ? (
                        <div className="mb-1.5 h-2 rounded-full bg-primary/50" />
                      ) : null}
                      <div
                        data-card-key={key}
                        data-col-id={col.id}
                        onPointerDown={(e) => startPointer(e, { kind: "card", key, lead: it, from: col.id })}
                        className={cn(
                          "w-full cursor-grab touch-none select-none rounded-[0.9rem] bg-white px-2.5 py-2 text-left shadow-sm ring-1 ring-inset ring-black/12 active:cursor-grabbing",
                          on && "ring-2 ring-inset ring-primary/70",
                          lifting && "scale-[0.97] opacity-35",
                        )}
                      >
                        <CardFace it={it} color={col.color} hideBranch={hideBranch} onArchive={onArchive ? (lead) => setPending(lead) : undefined} />
                      </div>
                    </li>
                  );
                })
              ) : (
                <li data-col-id={col.id} className="px-2 py-6 text-center text-[0.75rem] text-muted">
                  нет лидов
                </li>
              )}
            </ul>
          </section>
        );
      })}
      {draggingCard && typeof document !== "undefined"
        ? createPortal(
            <div
              data-ghost="1"
              className="pointer-events-none fixed top-0 left-0 z-[280] w-[16.5rem] origin-top-left rounded-[0.9rem] bg-white px-2.5 py-2 shadow-[0_22px_44px_rgba(15,23,42,.32)] ring-1 ring-black/12"
              style={{ transform: `translate3d(${ghostPos.x + 12}px, ${ghostPos.y - 16}px, 0) rotate(-3deg) scale(1.04)` }}
            >
              <CardFace it={draggingCard.lead} color="#0f172a" hideBranch={hideBranch} />
            </div>,
            document.body,
          )
        : null}
      {pending && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[240] grid place-items-center bg-black/35 p-4" onClick={() => setPending(null)}>
              <div className={cn("w-full max-w-[22rem] p-5", RA_POP)} onClick={(e) => e.stopPropagation()}>
                <p className="font-display text-[1.05rem] leading-snug">В архив AlfaCRM?</p>
                <p className="mt-2 text-sm text-muted">
                  Карточка «{pending.name}» уйдёт в архив отказов. Это синхронизируется с AlfaCRM.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-full bg-black/6 px-4 text-sm font-semibold text-muted hover:bg-black/10"
                    onClick={() => setPending(null)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
                    onClick={() => {
                      const it = pending;
                      setPending(null);
                      if (it) onArchive?.(it);
                    }}
                  >
                    В архив
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
