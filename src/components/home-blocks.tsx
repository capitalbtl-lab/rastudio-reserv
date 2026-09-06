"use client";

import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { HomeEditorChrome, HomeEditorProvider, useHomeEditor } from "@/components/home-editor";
import { homeBlockLabel, isCustomBlockId, placeHomeBlock, visibleHomeOrder, type HomeBlockId, type HomeCustomBlock, type HomeLayoutDoc } from "@/data/home-layout-core";
import { SiteVideo } from "@/components/site-video";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { Button } from "@/components/ui/button";
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

export function BlockMedia({
  id,
  fallback,
  className,
  title,
}: {
  id: string;
  fallback?: string;
  className?: string;
  title?: string;
}) {
  const ctx = useHomeEditor();
  const src = ctx?.doc.media[id] || fallback;
  if (!src) return null;
  if (/\.mp4($|\?)/i.test(src)) {
    return <SiteVideo src={src} title={title} mode="ambient" className={className || "aspect-[4/3] w-full"} />;
  }
  return <SeoImage src={src} alt={title || ""} filename={src} className={className || "aspect-[4/3] rounded-3xl"} />;
}

function CustomHomeBlock({ block }: { block: HomeCustomBlock }) {
  const ctx = useHomeEditor();
  const src = ctx?.doc.media[block.id] || block.image;
  return (
    <section className="page-wrap py-12 md:py-16">
      <div className="grid items-center gap-8 overflow-hidden rounded-[2rem] bg-surface p-6 shadow-[var(--shadow-border)] md:grid-cols-2 md:gap-12 md:p-10">
        <div>
          {block.kicker ? <p className="kicker text-primary">{block.kicker}</p> : null}
          <h2 className="section-title mt-3">{block.title}</h2>
          <p className="mt-5 text-[0.98rem] leading-relaxed text-muted">{block.text}</p>
          {block.ctaLabel ? (
            <div className="mt-6">
              <Button asChild size="lg">
                {block.ctaHref?.startsWith("/") ? (
                  <PageLink to={block.ctaHref}>{block.ctaLabel}</PageLink>
                ) : (
                  <a href={block.ctaHref || "#trial"}>{block.ctaLabel}</a>
                )}
              </Button>
            </div>
          ) : null}
        </div>
        {src ? (
          /\.mp4($|\?)/i.test(src) ? (
            <div className="overflow-hidden rounded-3xl bg-header">
              <SiteVideo src={src} title={block.title} mode="ambient" className="aspect-[4/3] w-full" />
            </div>
          ) : (
            <SeoImage src={src} alt={block.title} filename={block.title} className="aspect-[4/3] rounded-3xl" />
          )
        ) : null}
      </div>
    </section>
  );
}

function HomeCanvasInner({ children }: { children: ReactNode }) {
  const ctx = useHomeEditor();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!ctx) return children;

  const map = new Map<string, ReactElement<{ id: HomeBlockId }>>();
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const id = (child.props as { id?: HomeBlockId }).id;
    if (id) map.set(id, child as ReactElement<{ id: HomeBlockId }>);
  });
  const ids = visibleHomeOrder(ctx.doc, ctx.editing);
  const slots = ids.map((id) => {
    const built = map.get(id);
    if (built) return { id, node: built as ReactNode };
    const custom = ctx.doc.customs.find((c) => c.id === id);
    if (custom) return { id, node: <CustomHomeBlock block={custom} /> };
    return null;
  }).filter(Boolean) as { id: string; node: ReactNode }[];
  const deviceW = ctx.editing ? (ctx.device === "phone" ? "max-w-[390px]" : ctx.device === "tablet" ? "max-w-[768px]" : "max-w-none") : "";

  return (
    <div className={cn(ctx.editing && "home-layout-on")}>
      <HomeEditorChrome />
      <div className={cn(ctx.editing && "md:px-60", ctx.editing && deviceW && "mx-auto", deviceW)}>
        {slots.map((slot) => (
          <HomeSlotFrame
            key={slot.id}
            id={slot.id}
            drag={drag}
            over={over}
            onDragId={setDrag}
            onOver={setOver}
          >
            {slot.node}
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
  id: string;
  drag: string | null;
  over: string | null;
  onDragId: (id: string | null) => void;
  onOver: (id: string | null) => void;
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
