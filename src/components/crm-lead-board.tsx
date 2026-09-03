"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CRM_BRANCH } from "@/data/ids";
import { LEAD_STAGES, pinUnsorted, type LeadCard, type LeadStage } from "@/data/crm-leads";
import { RA_POP } from "@/data/admin-ui";
import { cn } from "@/lib/utils";

const LIFT = 6;
const EDGE = 40;
const SCROLL = 16;
const TILT_MAX = 2.4;

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

type GhostPos = {
  x: number;
  y: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  tilt: number;
  lastX: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

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
  onReorderStages,
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
  onReorderStages?: (ids: number[]) => void;
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
  const [hint, setHint] = useState("");
  const [order, setOrder] = useState<Record<number, string[]>>({});
  const [lift, setLift] = useState({ w: 264, h: 72 });
  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const overRef = useRef<{ col: number | null; key: string }>({ col: null, key: "" });
  const orderRef = useRef<Record<number, string[]>>({});
  const startOrderRef = useRef<Record<number, string[]>>({});
  const liveRef = useRef(false);
  const ghost = useRef<GhostPos>({ x: 0, y: 0, ox: 0, oy: 0, w: 264, h: 72, tilt: 0, lastX: 0 });
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const colOrderRef = useRef(colOrder);
  colOrderRef.current = colOrder;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const startColsRef = useRef<number[]>([]);
  const onReorderRef = useRef(onReorderStages);
  onReorderRef.current = onReorderStages;

  useEffect(() => setColOrder(ids), [ids.join(",")]);
  useEffect(() => {
    if (drag) paintGhost();
  }, [drag]);

  const cols = colOrder.map((id) => base.find((s) => s.id === id)).filter((s): s is LeadStage => Boolean(s));
  const renderCols = base.filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i);

  function persistCols(next: number[]) {
    const pinned = pinUnsorted(next);
    setColOrder(pinned);
    colOrderRef.current = pinned;
    setHint("Записываю порядок в AlfaCRM…");
    onReorderRef.current?.(pinned);
  }

  function shiftCol(id: number, dir: -1 | 1) {
    if (id === 0) return;
    const cur = colOrderRef.current.slice();
    const i = cur.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length || cur[j] === 0) return;
    const next = cur.slice();
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    persistCols(next);
  }

  function placeCol(movingId: number, overId: number) {
    if (movingId === 0 || overId === 0 || movingId === overId) return;
    const cur = colOrderRef.current;
    const i = cur.indexOf(movingId);
    const j = cur.indexOf(overId);
    if (i < 0 || j < 0) return;
    const next = cur.slice();
    next.splice(i, 1);
    next.splice(j, 0, movingId);
    const pinned = pinUnsorted(next);
    if (pinned.join(",") === cur.join(",")) return;
    colOrderRef.current = pinned;
    setColOrder(pinned);
  }

  function seedOrder(): Record<number, string[]> {
    const next: Record<number, string[]> = {};
    for (const col of cols) {
      const keys = orderRef.current[col.id];
      if (keys?.length) {
        const valid = new Set(itemsRef.current.filter((x) => x.statusId === col.id).map(leadKey));
        const keep = keys.filter((k) => valid.has(k));
        for (const k of valid) if (!keep.includes(k)) keep.push(k);
        next[col.id] = keep;
      } else {
        next[col.id] = itemsRef.current
          .filter((x) => x.statusId === col.id)
          .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id)
          .map(leadKey);
      }
    }
    return next;
  }

  function placeInCol(lead: LeadCard, colId: number, beforeKey?: string) {
    const moving = leadKey(lead);
    const prev: Record<number, string[]> = {};
    for (const [cid, keys] of Object.entries(orderRef.current)) prev[Number(cid)] = keys.slice();
    for (const cid of Object.keys(prev)) {
      const id = Number(cid);
      if (id === colId) continue;
      prev[id] = (prev[id] || []).filter((k) => k !== moving);
    }
    const inCol = new Set(
      itemsRef.current.filter((x) => x.statusId === colId && leadKey(x) !== moving).map(leadKey),
    );
    const keep = (prev[colId] || []).filter((k) => k !== moving);
    for (const k of inCol) if (!keep.includes(k)) keep.push(k);
    const at = beforeKey ? keep.indexOf(beforeKey) : -1;
    if (at >= 0) keep.splice(at, 0, moving);
    else keep.push(moving);
    if ((prev[colId] || []).join("|") === keep.join("|")) return false;
    prev[colId] = keep;
    orderRef.current = prev;
    setOrder(prev);
    return true;
  }

  function cardsOf(colId: number) {
    const moving = dragRef.current?.kind === "card" ? dragRef.current : null;
    const byKey = new Map(items.map((it) => [leadKey(it), it] as const));
    if (moving) byKey.set(moving.key, moving.lead);
    const keys = order[colId] ?? orderRef.current[colId];
    if (keys?.length) {
      const out: LeadCard[] = [];
      const seen = new Set<string>();
      for (const k of keys) {
        const it = byKey.get(k);
        if (!it || seen.has(k)) continue;
        seen.add(k);
        out.push(it);
      }
      for (const it of items) {
        const k = leadKey(it);
        if (seen.has(k) || (moving && k === moving.key)) continue;
        if (it.statusId === colId) {
          seen.add(k);
          out.push(it);
        }
      }
      return moving ? out.filter((it) => leadKey(it) !== moving.key) : out;
    }
    return items
      .filter((it) => it.statusId === colId && (!moving || leadKey(it) !== moving.key))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
  }

  function paintGhost() {
    const el = ghostRef.current;
    const g = ghost.current;
    if (!el) return;
    el.style.transform = `translate3d(${g.x - g.ox}px, ${g.y - g.oy}px, 0) rotate(${g.tilt}deg) scale(1.02)`;
    el.style.transformOrigin = `${g.ox}px ${g.oy}px`;
  }

  function flipColumn(colId: number) {
    const root = boardRef.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll<HTMLElement>(`section[data-col-id="${colId}"] li[data-card-key]`)];
    const first = new Map(nodes.map((n) => [n.dataset.cardKey || "", n.getBoundingClientRect().top]));
    requestAnimationFrame(() => {
      for (const n of nodes) {
        const k = n.dataset.cardKey || "";
        const from = first.get(k);
        if (from == null) continue;
        const to = n.getBoundingClientRect().top;
        const dy = from - to;
        if (Math.abs(dy) < 1) continue;
        n.style.transition = "none";
        n.style.transform = `translateY(${dy}px)`;
        n.getBoundingClientRect();
        n.style.transition = "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
        n.style.transform = "";
      }
    });
  }

  function columnAt(x: number, y: number) {
    const root = boardRef.current;
    if (!root) return null as number | null;
    const sections = root.querySelectorAll<HTMLElement>("section[data-col-id]");
    let col: number | null = null;
    let best = Infinity;
    for (const sec of sections) {
      const r = sec.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return Number(sec.dataset.colId);
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dx + dy * 0.35;
      if (d < best) {
        best = d;
        col = Number(sec.dataset.colId);
      }
    }
    return col;
  }

  function collide() {
    const current = dragRef.current;
    if (!current) return;
    const root = boardRef.current;
    if (!root) return;
    const g = ghost.current;
    if (current.kind === "col") {
      const col = columnAt(g.x, g.y);
      if (col != null) {
        if (col !== overRef.current.col) {
          overRef.current = { col, key: "" };
          setOverCol(col);
        }
        placeCol(current.id, col);
      }
      return;
    }
    const cx = g.x;
    const cy = g.y;
    const col = columnAt(cx, cy);
    if (col == null) return;
    const ul = root.querySelector<HTMLElement>(`section[data-col-id="${col}"] ul`);
    if (ul) {
      const box = ul.getBoundingClientRect();
      if (g.y < box.top + EDGE) ul.scrollTop -= SCROLL;
      else if (g.y > box.bottom - EDGE) ul.scrollTop += SCROLL;
    }
    const cards = root.querySelectorAll<HTMLElement>(`section[data-col-id="${col}"] li[data-card-key]`);
    const seen = new Set<string>();
    let key = "";
    for (const el of cards) {
      const k = el.dataset.cardKey || "";
      if (!k || k === current.key || seen.has(k)) continue;
      seen.add(k);
      const r = el.getBoundingClientRect();
      if (cy < r.top + r.height / 2) {
        key = k;
        break;
      }
    }
    if (overRef.current.col === col && overRef.current.key === key) return;
    overRef.current = { col, key };
    setOverCol(col);
    setOverKey(key);
    const moved = placeInCol(current.lead, col, key || undefined);
    if (moved) flipColumn(col);
  }

  function finish(commit: boolean) {
    const current = dragRef.current;
    if (current?.kind === "col") collide();
    if (!current && !liveRef.current) return;
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
      const colId = dest.col ?? current.from;
      const keys = orderRef.current[colId] || [];
      const i = keys.indexOf(current.key);
      const beforeKey = i >= 0 && i < keys.length - 1 ? keys[i + 1] : "";
      const started = (startOrderRef.current[current.from] || []).join("|");
      const nowKeys = keys.join("|");
      if (colId === current.from && nowKeys === started) return;
      const beforeId = beforeKey ? Number(beforeKey.split(":")[1] || 0) || undefined : undefined;
      onMoveRef.current?.(current.lead, colId, beforeId);
      return;
    }
    const now = colOrderRef.current;
    if (now.join(",") !== startColsRef.current.join(",")) persistCols(now);
  }

  function startPointer(e: React.PointerEvent, next: Drag) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest?.("[data-lead-del],[data-no-drag]")) return;
    e.stopPropagation();
    const originX = e.clientX;
    const originY = e.clientY;
    const pid = e.pointerId;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    liveRef.current = false;
    dragRef.current = next;
    const seeded = seedOrder();
    orderRef.current = seeded;
    startOrderRef.current = Object.fromEntries(Object.entries(seeded).map(([k, v]) => [Number(k), v.slice()]));
    startColsRef.current = colOrderRef.current.slice();
    setOrder(seeded);
    overRef.current = { col: next.kind === "card" ? next.from : next.id, key: next.kind === "card" ? next.key : "" };
    ghost.current = {
      x: e.clientX,
      y: e.clientY,
      ox: e.clientX - rect.left,
      oy: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
      tilt: 0,
      lastX: e.clientX,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(pid);
    } catch {
      /* */
    }

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      const g = ghost.current;
      const vx = ev.clientX - g.lastX;
      g.x = ev.clientX;
      g.y = ev.clientY;
      g.lastX = ev.clientX;
      g.tilt = clamp(g.tilt * 0.62 + vx * 0.22, -TILT_MAX, TILT_MAX);
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (!liveRef.current) {
        if (dx * dx + dy * dy < LIFT * LIFT) return;
        liveRef.current = true;
        setLift({ w: g.w, h: g.h });
        setDrag(next);
        document.body.classList.add("ra-lead-dragging");
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        document.body.style.touchAction = "none";
        requestAnimationFrame(paintGhost);
      } else {
        paintGhost();
        collide();
      }
      ev.preventDefault();
    };
    const stop = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
      window.removeEventListener("pointercancel", stop, true);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(pid);
      } catch {
        /* */
      }
      const started = liveRef.current;
      if (!started) {
        dragRef.current = null;
        if (next.kind === "card") onOpenRef.current(next.lead);
        return;
      }
      ghost.current.x = ev.clientX;
      ghost.current.y = ev.clientY;
      ghost.current.tilt = 0;
      collide();
      finish(ev.type === "pointerup");
    };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", stop, { capture: true });
    window.addEventListener("pointercancel", stop, { capture: true });
  }

  const draggingCard = drag?.kind === "card" ? drag : null;
  const draggingCol = drag?.kind === "col" ? drag : null;
  const draggingStage = draggingCol ? base.find((s) => s.id === draggingCol.id) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {hint ? <p className="shrink-0 px-1 text-[0.78rem] font-semibold text-emerald-800">{hint}</p> : null}
    <div ref={boardRef} className="pretty-scroll relative flex min-h-0 flex-1 gap-3 overflow-x-auto p-1">
      {renderCols.map((col) => {
        const list = cardsOf(col.id);
        const hot = overCol === col.id && Boolean(draggingCard);
        const vis = colOrder.indexOf(col.id);
        return (
          <section
            key={col.id}
            data-col-id={col.id}
            style={{ order: vis < 0 ? 80 + col.id : vis }}
            className={cn(
              "flex min-h-0 min-w-[16.5rem] flex-1 flex-col rounded-[1.2rem] bg-white/80 ring-1 ring-black/6 transition-[box-shadow,background-color,opacity] duration-150",
              hot && "bg-primary/[0.08] shadow-[0_0_0_2px_var(--color-primary,#2563eb)]",
              draggingCol && draggingCol.id === col.id && "opacity-40",
              overCol === col.id && draggingCol && draggingCol.id !== col.id && "shadow-[0_0_0_2px_var(--color-primary,#2563eb)]",
            )}
          >
            <header
              data-col-id={col.id}
              onPointerDown={col.id === 0 ? undefined : (e) => startPointer(e, { kind: "col", id: col.id })}
              className={cn(
                "flex items-center justify-between gap-2 px-3 py-2.5",
                col.id === 0 ? "cursor-default" : "cursor-grab active:cursor-grabbing",
              )}
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
              <span className="flex items-center gap-0.5" data-no-drag="1">
                {col.id !== 0 ? (
                  <>
                    <button
                      type="button"
                      title="Сдвинуть влево в AlfaCRM"
                      className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-black/8 hover:text-fg disabled:opacity-30"
                      disabled={cols.findIndex((s) => s.id === col.id) <= 1}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        shiftCol(col.id, -1);
                      }}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      title="Сдвинуть вправо в AlfaCRM"
                      className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-black/8 hover:text-fg disabled:opacity-30"
                      disabled={cols.findIndex((s) => s.id === col.id) === cols.length - 1}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        shiftCol(col.id, 1);
                      }}
                    >
                      ›
                    </button>
                  </>
                ) : null}
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
                <span className="tabular-nums text-[0.75rem] opacity-70">{list.length + (draggingCard && overCol === col.id ? 1 : 0)}</span>
              </span>
            </header>
            <ul data-col-id={col.id} className="pretty-scroll min-h-[8rem] flex-1 space-y-1.5 overflow-y-auto px-2.5 pb-2.5 pt-1.5">
              {list.length || (hot && draggingCard) ? (
                <>
                  {list.map((it) => {
                    const key = leadKey(it);
                    const on = activeId === it.customerId || activeId === it.id;
                    return (
                      <Fragment key={key}>
                        {overKey === key && draggingCard && draggingCard.key !== key ? (
                          <li
                            data-slot="1"
                            data-col-id={col.id}
                            className="rounded-[0.9rem] bg-primary/10 ring-2 ring-dashed ring-primary/40"
                            style={{ height: lift.h }}
                          />
                        ) : null}
                        <li data-card-key={key} data-col-id={col.id} className="ra-lead-card">
                          <div
                            data-card-key={key}
                            data-col-id={col.id}
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            onPointerDown={(e) => startPointer(e, { kind: "card", key, lead: it, from: col.id })}
                            className={cn(
                              "w-full cursor-grab touch-none select-none rounded-[0.9rem] bg-white px-2.5 py-2 text-left shadow-sm ring-1 ring-inset ring-black/12 active:cursor-grabbing",
                              on && "ring-2 ring-inset ring-primary/70",
                            )}
                          >
                            <CardFace it={it} color={col.color} hideBranch={hideBranch} onArchive={onArchive ? (lead) => setPending(lead) : undefined} />
                          </div>
                        </li>
                      </Fragment>
                    );
                  })}
                  {hot && draggingCard && !overKey ? (
                    <li
                      data-slot="1"
                      data-col-id={col.id}
                      className="rounded-[0.9rem] bg-primary/10 ring-2 ring-dashed ring-primary/40"
                      style={{ height: lift.h }}
                    />
                  ) : null}
                </>
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
              ref={ghostRef}
              data-ghost="1"
              className="ra-lead-ghost pointer-events-none fixed top-0 left-0 z-[280] rounded-[0.9rem] bg-white px-2.5 py-2 shadow-[0_12px_28px_rgba(15,23,42,.18)] ring-1 ring-black/8"
              style={{
                width: lift.w,
                transform: `translate3d(${ghost.current.x - ghost.current.ox}px, ${ghost.current.y - ghost.current.oy}px, 0) rotate(${ghost.current.tilt}deg) scale(1.02)`,
                transformOrigin: `${ghost.current.ox}px ${ghost.current.oy}px`,
              }}
            >
              <CardFace it={draggingCard.lead} color="#0f172a" hideBranch={hideBranch} />
            </div>,
            document.body,
          )
        : null}
      {draggingCol && draggingStage && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={ghostRef}
              data-ghost="1"
              className="ra-lead-ghost pointer-events-none fixed top-0 left-0 z-[280] rounded-[0.9rem] bg-white px-3 py-2 text-[0.82rem] font-semibold shadow-[0_12px_28px_rgba(15,23,42,.18)] ring-1 ring-black/8"
              style={{
                width: Math.max(180, lift.w),
                color: draggingStage.color,
                transform: `translate3d(${ghost.current.x - ghost.current.ox}px, ${ghost.current.y - ghost.current.oy}px, 0) rotate(${ghost.current.tilt}deg) scale(1.02)`,
                transformOrigin: `${ghost.current.ox}px ${ghost.current.oy}px`,
              }}
            >
              {draggingStage.name}
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
    </div>
  );
}
