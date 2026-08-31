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

export function TrialSlots({ sessions }: { sessions: CmsSession[] }) {
  const slots = nextSlots(sessions, 3);
  if (!slots.length) return null;
  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">Ближайшие группы</p>
      <ul className="mt-3 space-y-2">
        {slots.map((slot) => {
          const meta = branchMeta(slot.session);
          return (
            <li key={slot.id}>
              <a
                href="#trial"
                className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5 shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
              >
                <span>
                  <span className="block text-sm font-semibold">
                    {slot.day || "День"} {slot.time}
                  </span>
                  <span className="text-xs text-muted">{meta.short}</span>
                </span>
                <span className="text-xs font-semibold text-primary">Занять →</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Objections() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {OBJECTIONS.map((item) => (
        <article key={item.title} className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
          <p className="text-sm font-semibold">{item.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{item.text}</p>
        </article>
      ))}
    </div>
  );
}

export function HeroReview({ path }: { path: string }) {
  const item = reviewsForPath(path)[0];
  if (!item) return null;
  return (
    <figure className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
        Яндекс · {YANDEX_RATING.score}
      </p>
      <blockquote className="mt-2 text-sm leading-relaxed text-fg/90">«{item.text.slice(0, 180)}{item.text.length > 180 ? "…" : ""}»</blockquote>
      <figcaption className="mt-2 text-xs text-muted">
        {item.name} · {item.course}
      </figcaption>
    </figure>
  );
}

export function ConvertBand({ path, sessions }: { path: string; sessions: CmsSession[] }) {
  return (
    <section className="border-b border-border bg-bg">
      <div className="page-wrap grid gap-6 py-8 md:grid-cols-2 md:items-start">
        <TrialSlots sessions={sessions} />
        <div className="space-y-4">
          <Objections />
          <HeroReview path={path} />
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
