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
        {REVIEWS.map((item, i) => {
          const featured = i === 0;
          return (
            <article
              key={item.name + item.date}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-3xl p-5 shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-border-hover)]",
                featured
                  ? "bg-header text-header-fg sm:col-span-2 lg:row-span-2 lg:p-8"
                  : "bg-surface",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none absolute -top-4 right-3 select-none font-display text-[6.5rem] leading-none",
                  featured ? "text-white/10" : "text-primary/10",
                )}
                aria-hidden
              >
                “
              </span>
              <div className="relative flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]",
                    featured ? "bg-white/12 text-header-fg" : "bg-primary/10 text-primary",
                  )}
                >
                  {item.course}
                </span>
                <span className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star
                      key={s}
                      className={cn("size-3", featured ? "fill-white/80 text-white/80" : "fill-primary text-primary")}
                      strokeWidth={0}
                    />
                  ))}
                </span>
              </div>
              <p
                className={cn(
                  "relative mt-4 leading-relaxed",
                  featured
                    ? "display text-xl text-header-fg/90 md:text-2xl md:leading-snug"
                    : "text-[0.95rem] text-fg/85",
                )}
              >
                {item.text}
              </p>
              <div className="relative mt-auto flex items-center gap-3 pt-5">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    featured ? "bg-white/12 text-header-fg" : "bg-primary/10 text-primary",
                  )}
                >
                  {initials(item.name)}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{item.name}</span>
                  <span className={cn("text-xs", featured ? "text-header-fg/55" : "text-muted")}>{item.date}</span>
                </span>
              </div>
            </article>
          );
        })}
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
