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
    <section className="page-wrap py-8 md:py-10">
      <div className="overflow-hidden rounded-[1.75rem] bg-surface shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-5 md:px-7">
          <div>
            <p className="kicker text-primary">Ближайшие группы</p>
            <h2 className="display mt-2 text-[1.65rem] md:text-[1.85rem]">Прийти на этой неделе</h2>
          </div>
          <p className="text-sm text-muted">Яндекс {YANDEX_RATING.score} · пробное без абонемента</p>
        </div>

        {slots.length ? (
          <ul className="grid border-t border-border/70 md:grid-cols-3">
            {slots.map((slot, i) => {
              const meta = branchMeta(slot.session);
              return (
                <li key={slot.id} className={cn(i > 0 && "border-t border-border/70 md:border-t-0 md:border-l")}>
                  <a
                    href="#trial"
                    className="group flex h-full items-center justify-between gap-4 px-5 py-5 transition-colors hover:bg-bg/70 md:px-7"
                  >
                    <span>
                      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
                        {meta.city}
                      </span>
                      <span className="display mt-1 block text-[1.45rem] leading-none">
                        {slot.day} {slot.time}
                      </span>
                      <span className="mt-1.5 block text-sm text-muted">{meta.short}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-primary">Занять</span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}

        <ul className="grid gap-5 border-t border-border/70 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4 md:px-7">
          {OBJECTIONS.map((item) => (
            <li key={item.title}>
              <p className="text-sm font-semibold leading-snug">{item.title}</p>
              <p className="mt-1 text-[0.8rem] leading-relaxed text-muted">{item.text}</p>
            </li>
          ))}
        </ul>

        {review ? (
          <blockquote className="border-t border-border/70 px-5 py-5 md:px-7">
            <p className="max-w-3xl text-[0.98rem] leading-relaxed text-fg/85">
              «{review.text.length > 220 ? `${review.text.slice(0, 220).trim()}…` : review.text}»
            </p>
            <footer className="mt-2 text-sm text-muted">
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
