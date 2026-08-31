"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SiteImage } from "@/data/catalog";
import { SeoImage } from "@/components/seo-image";

export function PhotoSlider({ images }: { images: SiteImage[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  if (!images.length) return null;

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
        {images.length > 1 ? (
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
      <div ref={scroller} className="gallery-slider mt-6">
        {images.map((img) => (
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
    </section>
  );
}
