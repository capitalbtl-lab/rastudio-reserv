import type { CmsSession } from "@/data/cms";
import { SITE } from "@/data/site";
import { TRIAL_PROMISE } from "@/data/course-offer";
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
  if (!slots.length && !review) return null;

  return (
    <section className="page-wrap py-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="kicker text-primary">Ближайшие группы</p>
          <h2 className="display mt-2 text-2xl md:text-[1.85rem]">Куда можно прийти на этой неделе</h2>
        </div>
        <p className="text-sm text-muted">Яндекс {YANDEX_RATING.score} · пробное без обязательств</p>
      </div>

      {slots.length ? (
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {slots.map((slot) => {
            const meta = branchMeta(slot.session);
            return (
              <li key={slot.id}>
                <a
                  href="#trial"
                  className="group flex h-full items-center justify-between gap-4 rounded-2xl bg-surface px-5 py-4 shadow-[var(--shadow-border)] transition-shadow hover:shadow-[var(--shadow-border-hover)]"
                >
                  <span>
                    <span className="inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
                      {meta.city}
                    </span>
                    <span className="display mt-2 block text-[1.35rem] leading-none">
                      {slot.day} {slot.time}
                    </span>
                    <span className="mt-1.5 block text-sm text-muted">{meta.short}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-primary group-hover:underline">
                    Занять
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}

      {review ? (
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">
          <span className="font-medium text-fg">«{review.text.slice(0, 140)}{review.text.length > 140 ? "…" : ""}»</span>
          <span> — {review.name}</span>
        </p>
      ) : null}
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
