"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { debugSession } from "@/data/debug-fn";
import { debugEmit } from "@/data/debug-client";
import { saveHomeLayoutFn } from "@/data/home-layout-fn";
import {
  homeBlockLabel,
  moveHomeBlock,
  normalizeHomeOrder,
  placeHomeBlock,
  type HomeBlockId,
} from "@/data/home-layout-core";
import { cn } from "@/lib/utils";

const KEY = "ra_debug";

function debugToken() {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function HomeCanvas({
  initialOrder,
  children,
}: {
  initialOrder?: string[];
  children: ReactNode;
}) {
  const [order, setOrder] = useState(() => normalizeHomeOrder(initialOrder));
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<HomeBlockId | null>(null);
  const [over, setOver] = useState<HomeBlockId | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setOrder(normalizeHomeOrder(initialOrder));
  }, [initialOrder]);

  useEffect(() => {
    const check = () => {
      const t = debugToken();
      if (!t) {
        setEditing(false);
        return;
      }
      void debugSession({ data: { token: t } }).then((res) => {
        setEditing(Boolean(res.ok && "tools" in res && res.tools.layout !== false));
      });
    };
    check();
    window.addEventListener("ra-debug-session", check);
    return () => window.removeEventListener("ra-debug-session", check);
  }, []);

  const persist = useCallback((next: HomeBlockId[]) => {
    setOrder(next);
    const token = debugToken();
    if (!token) return;
    void saveHomeLayoutFn({ data: { token, order: next } }).then((res) => {
      if (res.ok) {
        setMsg("Порядок сохранён");
        debugEmit("layout", { order: res.order, ok: true });
      } else {
        setMsg(res.error || "Не удалось сохранить");
        debugEmit("layout", { ok: false, error: res.error });
      }
      window.setTimeout(() => setMsg(""), 1800);
    });
  }, []);

  const slots = useMemo(() => {
    const map = new Map<string, ReactElement<{ id: HomeBlockId }>>();
    Children.forEach(children, (child) => {
      if (!isValidElement(child)) return;
      const id = (child.props as { id?: HomeBlockId }).id;
      if (id) map.set(id, child as ReactElement<{ id: HomeBlockId }>);
    });
    return order.map((id) => map.get(id)).filter(Boolean) as ReactElement<{ id: HomeBlockId }>[];
  }, [children, order]);

  return (
    <div className={cn(editing && "home-layout-on")}>
      {editing ? (
        <div className="sticky top-[3.75rem] z-30 sm:top-[4.75rem] md:top-[5.25rem]">
          <div className="mx-auto flex w-[min(1180px,calc(100%-1.5rem))] items-center justify-between gap-3 rounded-b-2xl bg-header px-4 py-2 text-[0.78rem] text-header-fg shadow-[0_12px_32px_-18px_rgba(0,0,0,.45)]">
            <p>Редактор главной: перетащите блок или стрелки вверх / вниз. Порядок виден всем на сайте.</p>
            <span className="shrink-0 text-header-fg/70">{msg || "отладка"}</span>
          </div>
        </div>
      ) : null}
      {slots.map((slot) => (
        <HomeSlotFrame
          key={slot.props.id}
          id={slot.props.id}
          editing={editing}
          dragging={drag === slot.props.id}
          over={over === slot.props.id && drag !== slot.props.id}
          onDragId={setDrag}
          onOver={setOver}
          onMove={(dir) => persist(moveHomeBlock(order, slot.props.id, dir))}
          onPlace={(id, before) => persist(placeHomeBlock(order, id, before))}
        >
          {slot}
        </HomeSlotFrame>
      ))}
    </div>
  );
}

export function HomeSlot({ id, children }: { id: HomeBlockId; children: ReactNode }) {
  return <>{children}</>;
}

function HomeSlotFrame({
  id,
  editing,
  dragging,
  over,
  onDragId,
  onOver,
  onMove,
  onPlace,
  children,
}: {
  id: HomeBlockId;
  editing: boolean;
  dragging: boolean;
  over: boolean;
  onDragId: (id: HomeBlockId | null) => void;
  onOver: (id: HomeBlockId | null) => void;
  onMove: (dir: -1 | 1) => void;
  onPlace: (id: HomeBlockId, before: HomeBlockId) => void;
  children: ReactNode;
}) {
  if (!editing) return <>{children}</>;
  return (
    <div
      className={cn(
        "relative outline outline-2 -outline-offset-2 transition-[outline-color,opacity]",
        over ? "outline-primary" : "outline-primary/35",
        dragging && "opacity-40",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        onOver(id);
      }}
      onDragLeave={() => onOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData("text/home-block") as HomeBlockId;
        onOver(null);
        onDragId(null);
        if (from && from !== id) onPlace(from, id);
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-header px-1.5 py-1 text-[0.7rem] font-semibold text-header-fg shadow-[0_10px_24px_-12px_rgba(0,0,0,.55)]">
          <button
            type="button"
            draggable
            aria-label={`Переместить «${homeBlockLabel(id)}»`}
            className="grid size-7 cursor-grab place-items-center rounded-full hover:bg-white/15 active:cursor-grabbing"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/home-block", id);
              e.dataTransfer.effectAllowed = "move";
              onDragId(id);
            }}
            onDragEnd={() => {
              onDragId(null);
              onOver(null);
            }}
          >
            <GripVertical className="size-3.5" />
          </button>
          <span className="px-1">{homeBlockLabel(id)}</span>
          <button
            type="button"
            aria-label="Выше"
            className="grid size-7 place-items-center rounded-full hover:bg-white/15"
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Ниже"
            className="grid size-7 place-items-center rounded-full hover:bg-white/15"
            onClick={() => onMove(1)}
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
