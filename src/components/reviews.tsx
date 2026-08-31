import { Star } from "lucide-react";
import { REVIEWS, YANDEX_RATING, YANDEX_REVIEWS } from "@/data/reviews";
import { Button } from "@/components/ui/button";

export function Reviews() {
  return (
    <section className="page-wrap py-16 md:py-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker text-primary">Яндекс Карты · {YANDEX_RATING.score}</p>
          <h2 className="section-title mt-3">Родители и ученики о студии</h2>
          <p className="mt-3 max-w-xl text-muted">
            {YANDEX_RATING.ratings} оценок, {YANDEX_RATING.reviews} отзыва. Тексты с Яндекса — без правок «под сайт».
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 shadow-[var(--shadow-border)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="size-4 fill-primary text-primary" strokeWidth={0} />
          ))}
          <span className="display text-lg">{YANDEX_RATING.score}</span>
        </div>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REVIEWS.map((item) => (
          <article key={item.name + item.date} className="flex flex-col rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">{item.course}</p>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-fg/85">{item.text}</p>
            <p className="mt-auto pt-4 text-sm font-semibold">{item.name}</p>
            <p className="text-xs text-muted">{item.date}</p>
          </article>
        ))}
      </div>
      <div className="mt-8">
        <Button asChild variant="secondary">
          <a href={YANDEX_REVIEWS} target="_blank" rel="noreferrer">
            Все отзывы на Яндекс Картах
          </a>
        </Button>
      </div>
    </section>
  );
}
