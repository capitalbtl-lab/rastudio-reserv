import type { CmsSession } from "@/data/cms";
import { SITE } from "@/data/site";
import { OBJECTIONS, TRIAL_PROMISE } from "@/data/course-offer";
import { reviewsForPath, YANDEX_RATING } from "@/data/reviews";
import { branchMeta, nextSlots } from "@/lib/schedule";
import { Button } from "@/components/ui/button";

export function TrialPromise({ light = false }: { light?: boolean }) {
  return (
    <p className={light ? "text-sm text-header-fg/70" : "text-sm text-muted"}>
      {TRIAL_PROMISE}
    </p>
  );
}

export function ConvertBand({ path, sessions }: { path: string; sessions: CmsSession[] }) {
  const slots = nextSlots(sessions, 3);
  const review = reviewsForPath(path)[0];

  return (
    <section className="border-b border-border">
      <div className="page-wrap py-8 md:py-10">
        <div className="overflow-hidden rounded-[1.75rem] bg-surface p-5 shadow-[var(--shadow-border)] md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="kicker text-primary">Пробное занятие</p>
              <h2 className="display mt-2 text-2xl md:text-3xl">Приходите посмотреть — решите после</h2>
            </div>
            {review ? (
              <p className="text-sm font-semibold text-muted">Яндекс · {YANDEX_RATING.score}</p>
            ) : null}
          </div>

          {slots.length ? (
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {slots.map((slot) => {
                const meta = branchMeta(slot.session);
                return (
                  <li key={slot.id}>
                    <a
                      href="#trial"
                      className="flex h-full flex-col rounded-2xl bg-bg px-4 py-4 transition-shadow hover:shadow-[var(--shadow-border-hover)]"
                    >
                      <span className="display text-[1.35rem] leading-none">
                        {slot.day || "День"}
                      </span>
                      <span className="mt-2 text-sm font-semibold">{slot.time}</span>
                      <span className="mt-1 text-sm text-muted">
                        {meta.city} · {meta.short}
                      </span>
                      <span className="mt-auto pt-4 text-sm font-semibold text-primary">Занять место →</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <ul className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4">
            {OBJECTIONS.map((item, i) => (
              <li key={item.title}>
                <p className="display text-[0.7rem] text-primary/50">0{i + 1}</p>
                <p className="mt-2 text-[0.95rem] font-semibold leading-snug">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{item.text}</p>
              </li>
            ))}
          </ul>

          {review ? (
            <figure className="mt-6 border-t border-border pt-6">
              <blockquote className="display max-w-3xl text-lg leading-snug md:text-xl">
                «{review.text.slice(0, 220)}
                {review.text.length > 220 ? "…" : ""}»
              </blockquote>
              <figcaption className="mt-3 text-sm text-muted">
                {review.name} · {review.course} · Яндекс Карты
              </figcaption>
            </figure>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ConvertAside() {
  return (
    <aside className="h-fit rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)] lg:sticky lg:top-24">
      <p className="text-sm font-semibold">Запись на пробное</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{TRIAL_PROMISE}</p>
      <p className="mt-4 text-sm font-semibold">
        <a href={SITE.phoneHref}>{SITE.phone}</a>
      </p>
      <p className="mt-1 text-xs text-muted">{SITE.email}</p>
      <Button asChild className="mt-5 w-full" size="lg">
        <a href="#trial">Записаться на пробное</a>
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
