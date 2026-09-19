"use client";

import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { EditText, useHomeEditor } from "@/components/home-read";
import { visibleHomeOrder, type HomeBlockId, type HomeCustomBlock } from "@/data/home-layout-core";
import { SiteVideo } from "@/components/site-video";
import { SeoImage } from "@/components/seo-image";
import { mediaAlt } from "@/data/media-alts-core";
import { PageLink } from "@/components/page-link";
import { Button } from "@/components/ui/button";
import { isTrialHref, openTrialForm } from "@/data/site-signup-core";
import { cn } from "@/lib/utils";

export function HomeSlot({ id, children }: { id: string; children: ReactNode }) {
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
    return <SiteVideo src={src} title={mediaAlt(src, title || "") || title} mode="ambient" className={className || "aspect-[4/3] w-full"} />;
  }
  return <SeoImage src={src} alt={mediaAlt(src, title || "")} filename={src} className={className || "aspect-[4/3] rounded-3xl"} />;
}

export function CustomHomeBlock({ block }: { block: HomeCustomBlock }) {
  const ctx = useHomeEditor();
  const src = ctx?.doc.media[block.id] || block.image;
  const kicker = ctx?.text(`${block.id}.kicker`, block.kicker) || block.kicker;
  const title = ctx?.text(`${block.id}.title`, block.title) || block.title;
  const text = ctx?.text(`${block.id}.text`, block.text) || block.text;
  return (
    <section className="page-wrap py-12 md:py-16">
      <div className="grid items-center gap-8 overflow-hidden rounded-[2rem] bg-surface p-6 shadow-[var(--shadow-border)] md:grid-cols-2 md:gap-12 md:p-10">
        <div>
          {kicker ? (
            <EditText id={`${block.id}.kicker`} as="p" className="kicker text-primary">
              {kicker}
            </EditText>
          ) : null}
          <EditText id={`${block.id}.title`} as="h2" className="section-title mt-3">
            {title}
          </EditText>
          <EditText id={`${block.id}.text`} as="p" className="mt-5 text-[0.98rem] leading-relaxed text-muted">
            {text}
          </EditText>
          {block.ctaLabel ? (
            <div className="mt-6">
              <Button asChild size="lg">
                {isTrialHref(block.ctaHref || "#trial") ? (
                  <a
                    href="#trial"
                    onClick={(e) => {
                      e.preventDefault();
                      openTrialForm();
                    }}
                  >
                    {block.ctaLabel}
                  </a>
                ) : block.ctaHref?.startsWith("/") ? (
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
              <SiteVideo src={src} title={title} mode="ambient" className="aspect-[4/3] w-full" />
            </div>
          ) : (
            <SeoImage src={src} alt={title} filename={title} className="aspect-[4/3] rounded-3xl" />
          )
        ) : null}
      </div>
    </section>
  );
}

export function slotBg(style?: { bg?: string }) {
  return style?.bg === "ink"
    ? "bg-header text-header-fg"
    : style?.bg === "paper"
      ? "bg-white text-fg"
      : style?.bg === "surface"
        ? "bg-surface text-fg"
        : "";
}

export function useHomeSlots(children: ReactNode, editing: boolean) {
  const ctx = useHomeEditor();
  if (!ctx) return [] as { id: string; node: ReactNode }[];
  const map = new Map<string, ReactElement<{ id: HomeBlockId }>>();
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const id = (child.props as { id?: HomeBlockId }).id;
    if (id) map.set(id, child as ReactElement<{ id: HomeBlockId }>);
  });
  return visibleHomeOrder(ctx.doc, editing)
    .map((id) => {
      const built = map.get(id);
      if (built) return { id, node: built as ReactNode };
      const custom = ctx.doc.customs.find((c) => c.id === id);
      if (custom) return { id, node: <CustomHomeBlock block={custom} /> };
      return null;
    })
    .filter(Boolean) as { id: string; node: ReactNode }[];
}

export function HomePublicInner({ children }: { children: ReactNode }) {
  const ctx = useHomeEditor();
  if (!ctx) return children;
  const slots = useHomeSlots(children, false);
  return (
    <div>
      {slots.map((slot) => {
        const style = ctx.doc.styles[slot.id];
        return (
          <div
            key={slot.id}
            className={cn(slotBg(style))}
            style={{ paddingTop: style?.padTop || undefined, paddingBottom: style?.padBottom || undefined }}
          >
            {slot.node}
          </div>
        );
      })}
    </div>
  );
}
