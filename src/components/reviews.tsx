"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { REVIEWS, YANDEX_RATING, YANDEX_REVIEWS } from "@/data/reviews";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.replace(/\./g, "").split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function FeaturedReview() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % REVIEWS.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [paused]);

  const item = REVIEWS[index];

  return (
    <article
      className="review-ink relative flex min-h-[22rem] flex-col overflow-hidden rounded-3xl p-5 text-header-fg sm:col-span-2 sm:min-h-[26rem] lg:row-span-2 lg:p-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div key={item.name + item.date} className="review-fade relative z-1 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-white/12 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-header-fg">
            {item.course}
          </span>
          <span className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, s) => (
              <Star key={s} className="size-3 fill-white/80 text-white/80" strokeWidth={0} />
            ))}
          </span>
        </div>
        <p className="display mt-5 text-xl leading-snug text-header-fg md:text-2xl md:leading-snug">
          {item.text}
        </p>
        <div className="mt-auto flex items-center gap-3 pt-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/12 text-sm font-semibold">
            {initials(item.name)}
          </span>
          <span>
            <span className="block text-sm font-semibold">{item.name}</span>
            <span className="text-xs text-header-fg/55">{item.date}</span>
          </span>
        </div>
      </div>
      <div className="relative z-1 mt-5 flex gap-1.5">
        {REVIEWS.map((review, i) => (
          <button
            key={review.name + review.date}
            type="button"
            aria-label={review.name}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index ? "w-6 bg-white" : "w-1.5 bg-white/30 hover:bg-white/55",
            )}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </article>
  );
}

export function Reviews() {
  return (
    <section className="page-wrap pb-16 pt-4 md:pb-20 md:pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker text-primary">Яндекс Карты · {YANDEX_RATING.score}</p>
          <h2 className="section-title mt-2">Родители и ученики о студии</h2>
        </div>
        <a
          href={YANDEX_REVIEWS}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 shadow-[var(--shadow-border)]"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="size-3.5 fill-primary text-primary" strokeWidth={0} />
          ))}
          <span className="display text-lg leading-none">{YANDEX_RATING.score}</span>
          <span className="text-xs text-muted">{YANDEX_RATING.ratings} оценок</span>
        </a>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FeaturedReview />
        {REVIEWS.slice(1).map((item) => (
          <article
            key={item.name + item.date}
            className="group relative flex flex-col overflow-hidden rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-border-hover)]"
          >
            <span
              className="pointer-events-none absolute -top-4 right-3 select-none font-display text-[6.5rem] leading-none text-primary/10"
              aria-hidden
            >
              “
            </span>
            <div className="relative flex items-center justify-between gap-3">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
                {item.course}
              </span>
              <span className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="size-3 fill-primary text-primary" strokeWidth={0} />
                ))}
              </span>
            </div>
            <p className="relative mt-4 text-[0.95rem] leading-relaxed text-fg/85">{item.text}</p>
            <div className="relative mt-auto flex items-center gap-3 pt-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials(item.name)}
              </span>
              <span>
                <span className="block text-sm font-semibold">{item.name}</span>
                <span className="text-xs text-muted">{item.date}</span>
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-6">
        <Button asChild variant="secondary">
          <a href={YANDEX_REVIEWS} target="_blank" rel="noreferrer">
            Все {YANDEX_RATING.reviews} отзыва на Яндекс Картах
          </a>
        </Button>
      </div>
    </section>
  );
}
