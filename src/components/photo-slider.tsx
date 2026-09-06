"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SiteImage } from "@/data/catalog";
import { SeoImage } from "@/components/seo-image";
import { cn } from "@/lib/utils";

export function PhotoSlider({ images }: { images: SiteImage[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  if (!images.length) return null;

  const featured = images[0];
  const mosaic = images.slice(1, 5);
  const extra = images.slice(5);

  function move(dir: -1 | 1) {
    const el = scroller.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.72, 280);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="kicker">Студия в кадре</p>
          <h2 className="display mt-2 text-2xl md:text-3xl">Живые занятия</h2>
        </div>
        {extra.length > 1 ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full bg-surface shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
              onClick={() => move(-1)}
              aria-label="Предыдущее фото"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full bg-surface shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
              onClick={() => move(1)}
              aria-label="Следующее фото"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-6 grid gap-3",
          mosaic.length ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1",
        )}
      >
        <figure className={cn(mosaic.length ? "sm:col-span-2 lg:col-span-2 lg:row-span-2" : "")}>
          <SeoImage
            src={featured.src}
            alt={featured.alt}
            filename={featured.filename}
            className={cn(
              "overflow-hidden rounded-3xl bg-surface-2",
              mosaic.length ? "aspect-[4/3] h-full min-h-56 lg:aspect-auto" : "aspect-[4/3]",
            )}
            imgClassName="h-full w-full object-cover"
          />
        </figure>
        {mosaic.map((img) => (
          <figure key={img.src + img.filename}>
            <SeoImage
              src={img.src}
              alt={img.alt}
              filename={img.filename}
              className="aspect-[4/3] overflow-hidden rounded-3xl bg-surface-2"
              imgClassName="h-full w-full object-cover"
            />
          </figure>
        ))}
      </div>

      {extra.length ? (
        <div ref={scroller} className="gallery-slider mt-3">
          {extra.map((img) => (
            <figure key={img.src + img.filename} className="gallery-slide">
              <SeoImage
                src={img.src}
                alt={img.alt}
                filename={img.filename}
                className="aspect-[4/3] overflow-hidden rounded-3xl bg-surface-2"
                imgClassName="h-full w-full object-cover"
              />
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  );
}
