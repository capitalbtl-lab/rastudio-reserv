import type { CmsSession } from "@/data/cms";
import { SITE } from "@/data/site";
import { OBJECTIONS, TRIAL_PROMISE } from "@/data/course-offer";
import { reviewsForPath, YANDEX_RATING } from "@/data/reviews";
import { branchMeta, nextSlots } from "@/lib/schedule";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConvertBand({ path, sessions }: { path: string; sessions: CmsSession[] }) {
  const slots = nextSlots(sessions, 3);
  const review = reviewsForPath(path)[0];

  return (
    <section className="page-wrap py-5 md:py-6">
      <div className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-end justify-between gap-2 px-5 py-3.5 md:px-6">
          <div>
            <p className="kicker text-primary">Ближайшие группы</p>
            <h2 className="display mt-1 text-xl md:text-2xl">Прийти на этой неделе</h2>
          </div>
          <p className="text-xs text-muted md:text-sm">Яндекс {YANDEX_RATING.score} · пробное без абонемента</p>
        </div>

        {slots.length ? (
          <ul
            className={cn(
              "grid border-t border-border/70",
              slots.length === 1 ? "md:grid-cols-1" : slots.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3",
            )}
          >
            {slots.map((slot, i) => {
              const meta = branchMeta(slot.session);
              return (
                <li key={slot.id} className={cn(i > 0 && "border-t border-border/70 md:border-t-0 md:border-l")}>
                  <div className="flex h-full items-center justify-between gap-3 px-5 py-3.5 md:px-6">
                    <span>
                      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
                        {meta.city}
                      </span>
                      <span className="display mt-0.5 block text-[1.2rem] leading-none">
                        {slot.day} {slot.time}
                      </span>
                      <span className="mt-1 block text-xs text-muted">{meta.short}</span>
                    </span>
                    <Button asChild size="sm" className="shrink-0">
                      <a href="#trial">Записаться</a>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-border/70 px-5 py-3 md:px-6">
          <Button asChild>
            <a href="#trial">Записаться на пробное</a>
          </Button>
          <Button asChild variant="outline">
            <a href={SITE.phoneHref}>{SITE.phone}</a>
          </Button>
        </div>

        <ul className="grid gap-3 border-t border-border/70 px-5 py-3.5 sm:grid-cols-2 lg:grid-cols-4 md:px-6">
          {OBJECTIONS.map((item) => (
            <li key={item.title}>
              <p className="text-[0.86rem] font-semibold leading-snug">{item.title}</p>
              <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">{item.text}</p>
            </li>
          ))}
        </ul>

        {review ? (
          <blockquote className="border-t border-border/70 px-5 py-3.5 md:px-6">
            <p className="max-w-3xl text-[0.9rem] leading-relaxed text-fg/85">
              «{review.text.length > 180 ? `${review.text.slice(0, 180).trim()}…` : review.text}»
            </p>
            <footer className="mt-1.5 text-xs text-muted">
              {review.name} · {review.course} · Яндекс {YANDEX_RATING.score}
            </footer>
          </blockquote>
        ) : null}
      </div>
    </section>
  );
}

export function ConvertAside() {
  return (
    <aside className="h-fit rounded-[1.75rem] bg-surface p-6 shadow-[var(--shadow-border)] lg:sticky lg:top-24">
      <p className="kicker text-primary">Пробное</p>
      <p className="display mt-2 text-2xl">Записаться</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{TRIAL_PROMISE}</p>
      <p className="mt-4 text-sm font-semibold">
        <a href={SITE.phoneHref}>{SITE.phone}</a>
      </p>
      <Button asChild className="mt-5 w-full" size="lg">
        <a href="#trial">Оставить заявку</a>
      </Button>
      <a
        href={SITE.telegram}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block text-center text-sm font-semibold text-primary"
      >
        Написать в Telegram
      </a>
    </aside>
  );
}
