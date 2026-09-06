"use client";

import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { HomeEditorChrome, HomeEditorProvider, useHomeEditor } from "@/components/home-editor";
import {
  homeBlockLabel,
  placeHomeBlock,
  visibleHomeOrder,
  type HomeBlockId,
  type HomeLayoutDoc,
} from "@/data/home-layout-core";
import { cn } from "@/lib/utils";

export function HomeCanvas({
  initialOrder,
  layout,
  children,
}: {
  initialOrder?: unknown;
  layout?: unknown;
  children: ReactNode;
}) {
  return (
    <HomeEditorProvider initial={layout || initialOrder}>
      <HomeCanvasInner>{children}</HomeCanvasInner>
    </HomeEditorProvider>
  );
}

export function HomeSlot({ id, children }: { id: HomeBlockId; children: ReactNode }) {
  return <>{children}</>;
}

function HomeCanvasInner({ children }: { children: ReactNode }) {
  const ctx = useHomeEditor();
  const [drag, setDrag] = useState<HomeBlockId | null>(null);
  const [over, setOver] = useState<HomeBlockId | null>(null);
  if (!ctx) return children;

  const map = new Map<string, ReactElement<{ id: HomeBlockId }>>();
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const id = (child.props as { id?: HomeBlockId }).id;
    if (id) map.set(id, child as ReactElement<{ id: HomeBlockId }>);
  });
  const ids = visibleHomeOrder(ctx.doc, ctx.editing);
  const slots = ids.map((id) => map.get(id)).filter(Boolean) as ReactElement<{ id: HomeBlockId }>[];
  const deviceW = ctx.editing ? (ctx.device === "phone" ? "max-w-[390px]" : ctx.device === "tablet" ? "max-w-[768px]" : "max-w-none") : "";

  return (
    <div className={cn(ctx.editing && "home-layout-on")}>
      <HomeEditorChrome />
      <div className={cn(ctx.editing && "md:px-60", ctx.editing && deviceW && "mx-auto", deviceW)}>
        {slots.map((slot) => (
          <HomeSlotFrame
            key={slot.props.id}
            id={slot.props.id}
            drag={drag}
            over={over}
            onDragId={setDrag}
            onOver={setOver}
          >
            {slot}
          </HomeSlotFrame>
        ))}
      </div>
    </div>
  );
}

function HomeSlotFrame({
  id,
  drag,
  over,
  onDragId,
  onOver,
  children,
}: {
  id: HomeBlockId;
  drag: HomeBlockId | null;
  over: HomeBlockId | null;
  onDragId: (id: HomeBlockId | null) => void;
  onOver: (id: HomeBlockId | null) => void;
  children: ReactNode;
}) {
  const ctx = useHomeEditor();
  const editing = Boolean(ctx?.editing);
  const selected = ctx?.selected === id;
  const style = ctx?.doc.styles[id];
  const bg =
    style?.bg === "ink"
      ? "bg-header text-header-fg"
      : style?.bg === "paper"
        ? "bg-white text-fg"
        : style?.bg === "surface"
          ? "bg-surface text-fg"
          : "";

  if (!editing) {
    return (
      <div className={bg} style={{ paddingTop: style?.padTop || undefined, paddingBottom: style?.padBottom || undefined }}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative transition-[outline-color,opacity,box-shadow]",
        bg,
        selected ? "outline outline-2 outline-primary" : over ? "outline outline-2 outline-primary/50" : "outline outline-1 outline-primary/20",
        drag === id && "opacity-40",
        style?.hidden && "opacity-50",
      )}
      style={{ paddingTop: style?.padTop || undefined, paddingBottom: style?.padBottom || undefined }}
      onClick={(e) => {
        e.stopPropagation();
        ctx?.select(id);
      }}
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
        if (from && from !== id && ctx) ctx.setDoc({ ...ctx.doc, order: placeHomeBlock(ctx.doc.order, from, id) });
      }}
    >
      <div className="ve-ui pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2">
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-1 rounded-full px-1.5 py-1 text-[0.7rem] font-semibold shadow-[0_10px_24px_-12px_rgba(0,0,0,.55)]",
            selected ? "bg-primary text-primary-foreground" : "bg-header text-header-fg",
          )}
        >
          <button
            type="button"
            draggable
            aria-label={`Переместить «${homeBlockLabel(id)}»`}
            className="grid size-7 cursor-grab place-items-center rounded-full hover:bg-white/15 active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
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
          {style?.hidden ? <span className="pr-2 opacity-80">скрыт</span> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export type { HomeLayoutDoc };
