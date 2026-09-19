"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useHomeEditor } from "@/components/home-read";
import { extrasFromHome, type PageExtra } from "@/data/page-layout-core";
import { cn } from "@/lib/utils";

function ExtraBlock({ block }: { block: PageExtra }) {
  const pad = block.bg === "ink" ? "ink text-header-fg" : block.bg === "paper" ? "bg-surface-2" : "";
  const type: CSSProperties = {
    textAlign: block.align,
    fontSize: block.fontSize ? `${block.fontSize}px` : undefined,
    fontWeight: block.bold ? 700 : undefined,
    fontStyle: block.italic ? "italic" : undefined,
    textDecoration: block.underline ? "underline" : undefined,
    minHeight: block.h || undefined,
    paddingTop: block.padTop,
    paddingBottom: block.padBottom,
  };
  if (block.typeId === "heading") {
    return (
      <section className={cn("page-wrap py-8 overflow-x-clip", pad)} style={type}>
        <h2 className="display text-3xl leading-tight md:text-4xl">{block.title}</h2>
      </section>
    );
  }
  if (block.typeId === "rich-text") {
    return (
      <section className={cn("page-wrap max-w-3xl py-8 text-[1.02rem] leading-relaxed text-fg/85 overflow-x-clip", pad)} style={type}>
        {block.kicker ? <p className="kicker mb-3">{block.kicker}</p> : null}
        {block.title ? <h2 className="display mb-4 text-3xl">{block.title}</h2> : null}
        <p className="whitespace-pre-wrap">{block.text}</p>
      </section>
    );
  }
  if (block.typeId === "image" && block.image) {
    return (
      <section className={cn("page-wrap py-8 overflow-x-clip", pad)} style={type}>
        {block.title ? <h2 className="display mb-4 text-3xl">{block.title}</h2> : null}
        <img src={block.image} alt={block.title || ""} className="h-auto w-full max-w-full rounded-3xl object-cover" />
      </section>
    );
  }
  if (block.typeId === "video" && block.video) {
    return (
      <section className={cn("page-wrap py-8 overflow-x-clip", pad)} style={type}>
        {block.title ? <h2 className="display mb-4 text-3xl">{block.title}</h2> : null}
        <video src={block.video} controls className="aspect-video w-full max-w-full rounded-3xl" />
      </section>
    );
  }
  if (block.typeId === "buttons" && (block.ctaLabel || block.ctaHref)) {
    return (
      <section className={cn("page-wrap py-6 overflow-x-clip", pad)} style={type}>
        <a
          href={block.ctaHref || "#trial"}
          className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          {block.ctaLabel || "Записаться"}
        </a>
      </section>
    );
  }
  return (
    <section className={cn("page-wrap grid items-center gap-8 overflow-x-clip py-10 md:grid-cols-2 md:gap-12", pad)} style={type}>
      <div className="min-w-0">
        {block.kicker ? <p className="kicker">{block.kicker}</p> : null}
        {block.title ? <h2 className="display mt-3 text-3xl leading-tight md:text-4xl">{block.title}</h2> : null}
        {block.text ? <p className="mt-4 whitespace-pre-wrap text-[1.02rem] leading-relaxed text-fg/80">{block.text}</p> : null}
        {block.ctaLabel ? (
          <a
            href={block.ctaHref || "#trial"}
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            {block.ctaLabel}
          </a>
        ) : null}
      </div>
      {block.image ? (
        <img src={block.image} alt={block.title || ""} className="h-auto w-full max-w-full rounded-3xl object-cover" />
      ) : null}
    </section>
  );
}

export function PageExtras() {
  const ctx = useHomeEditor();
  const [remote, setRemote] = useState<PageExtra[]>([]);
  useEffect(() => {
    if (ctx?.editing) return;
    const path = typeof location !== "undefined" ? location.pathname.replace(/\/+$/, "") || "/" : "/";
    if (path === "/") return;
    let gone = false;
    void import("@/data/page-extras-fn").then(({ publicPageExtrasFn }) =>
      publicPageExtrasFn({ data: { path } }).then((res) => {
        if (!gone && res.ok && "extras" in res) setRemote(res.extras);
      }),
    );
    return () => {
      gone = true;
    };
  }, [ctx?.editing, ctx?.dirty]);
  const extras = useMemo(() => (ctx?.editing ? extrasFromHome(ctx.doc) : remote), [ctx?.editing, ctx?.doc, remote]);
  if (!extras.length) return null;
  return (
    <div className="ve-extras w-full max-w-full overflow-x-clip">
      {extras.map((block) => (
        <ExtraBlock key={block.id} block={block} />
      ))}
    </div>
  );
}
