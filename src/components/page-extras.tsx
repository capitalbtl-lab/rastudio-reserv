"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useHomeEditor } from "@/components/home-read";
import { extrasFromHome, type PageExtra } from "@/data/page-layout-core";
import { libraryType } from "@/data/block-library-core";
import { paintVeFrames, type VeStyle } from "@/lib/ve-paint";
import { cn } from "@/lib/utils";

function picsOf(block: PageExtra) {
  const out = [...(block.images || [])];
  if (block.image && !out.includes(block.image)) out.unshift(block.image);
  return out;
}

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
  const label = libraryType(block.typeId)?.label || block.title || "";
  const pics = picsOf(block);
  const cta = (
    block.ctaLabel ? (
      <a
        href={block.ctaHref || "#trial"}
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        {block.ctaLabel}
      </a>
    ) : null
  );

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
  if (block.typeId === "image" || (block.typeId === "stories" && pics[0] && !block.text)) {
    return (
      <section className={cn("page-wrap py-8 overflow-x-clip", pad)} style={type}>
        {block.title ? <h2 className="display mb-4 text-3xl">{block.title}</h2> : null}
        {pics[0] ? <img src={pics[0]} alt={block.title || ""} className="h-auto w-full max-w-full rounded-3xl object-cover" /> : null}
      </section>
    );
  }
  if ((block.typeId === "video" || block.typeId === "video-grid" || block.typeId === "robot") && block.video) {
    return (
      <section className={cn("page-wrap py-8 overflow-x-clip", pad)} style={type}>
        {block.title ? <h2 className="display mb-4 text-3xl">{block.title}</h2> : null}
        <video src={block.video} controls className="aspect-video w-full max-w-full rounded-3xl" />
      </section>
    );
  }
  if (block.typeId === "gallery") {
    return (
      <section className={cn("page-wrap py-10 overflow-x-clip", pad)} style={type}>
        {block.title ? <h2 className="display mb-6 text-3xl">{block.title}</h2> : <p className="kicker mb-6">{label}</p>}
        {pics.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pics.map((src) => (
              <img key={src} src={src} alt={block.title || ""} className="aspect-[4/3] w-full rounded-2xl object-cover" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Перетащите фото из медиатеки на этот блок.</p>
        )}
      </section>
    );
  }
  if (block.typeId === "ticker") {
    return (
      <section className={cn("overflow-x-clip py-4", pad)} style={type}>
        <p className="page-wrap text-sm font-semibold tracking-wide">{block.text || block.title}</p>
      </section>
    );
  }
  if (block.typeId === "buttons" || block.typeId === "convert-band" || block.typeId === "trial-form" || block.typeId === "trial" || block.typeId === "convert-aside") {
    return (
      <section className={cn("page-wrap py-8 overflow-x-clip", pad)} style={type}>
        {block.title ? <h2 className="display mb-4 text-3xl">{block.title}</h2> : null}
        {block.text ? <p className="mb-4 text-[1.02rem] leading-relaxed text-fg/80">{block.text}</p> : null}
        {cta || (
          <a href={block.ctaHref || "#trial"} className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
            {block.ctaLabel || "Записаться"}
          </a>
        )}
      </section>
    );
  }

  return (
    <section className={cn("page-wrap grid items-center gap-8 overflow-x-clip py-10 md:grid-cols-2 md:gap-12", pad)} style={type}>
      <div className="min-w-0">
        {block.kicker ? <p className="kicker">{block.kicker}</p> : <p className="kicker">{label}</p>}
        {block.title ? <h2 className="display mt-3 text-3xl leading-tight md:text-4xl">{block.title}</h2> : null}
        {block.text ? <p className="mt-4 whitespace-pre-wrap text-[1.02rem] leading-relaxed text-fg/80">{block.text}</p> : null}
        {cta}
      </div>
      {block.video ? (
        <video src={block.video} controls className="aspect-video w-full max-w-full rounded-3xl" />
      ) : pics[0] ? (
        <img src={pics[0]} alt={block.title || ""} className="h-auto w-full max-w-full rounded-3xl object-cover" />
      ) : null}
    </section>
  );
}

export function PageExtras() {
  const ctx = useHomeEditor();
  const [remote, setRemote] = useState<PageExtra[]>([]);
  const [styles, setStyles] = useState<Record<string, VeStyle>>({});
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(document.getElementById("content"));
  }, []);
  useEffect(() => {
    if (ctx?.editing) return;
    const path = typeof location !== "undefined" ? location.pathname.replace(/\/+$/, "") || "/" : "/";
    if (path === "/") return;
    let gone = false;
    void import("@/data/page-extras-fn").then(({ publicPageExtrasFn }) =>
      publicPageExtrasFn({ data: { path } }).then((res) => {
        if (gone || !res.ok) return;
        if ("extras" in res) setRemote(res.extras);
        if ("styles" in res) setStyles(res.styles || {});
      }),
    );
    return () => {
      gone = true;
    };
  }, [ctx?.editing, ctx?.dirty]);
  const extras = useMemo(() => (ctx?.editing ? extrasFromHome(ctx.doc) : remote), [ctx?.editing, ctx?.doc, remote]);
  useLayoutEffect(() => {
    if (ctx?.editing) return;
    paintVeFrames(styles, "live");
  }, [styles, extras, ctx?.editing]);
  if (!extras.length) return null;
  const node = (
    <div className="ve-extras w-full max-w-full overflow-x-clip">
      {extras.map((block) => (
        <div key={block.id} data-ve-frame={block.id}>
          <ExtraBlock block={block} />
        </div>
      ))}
    </div>
  );
  return host ? createPortal(node, host) : node;
}
