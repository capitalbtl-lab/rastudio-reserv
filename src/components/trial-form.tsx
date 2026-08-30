import { SITE } from "@/data/site";

export function TrialForm({ compact = false }: { compact?: boolean }) {
  return (
    <section
      id="trial"
      className="rounded-[28px] bg-fg px-6 py-10 text-bg shadow-[var(--shadow-border)] md:px-10"
    >
      <div className={`grid gap-8 ${compact ? "" : "lg:grid-cols-[1fr_1.1fr] lg:items-start"}`}>
        <div>
          <p className="text-sm font-medium tracking-wide text-bg/70">Пробное занятие</p>
          <h2 className="display mt-3 max-w-md text-3xl text-bg md:text-4xl">
            Приведите ребёнка на первое занятие
          </h2>
          <p className="mt-4 max-w-md text-pretty text-bg/75">
            Оставьте заявку — администратор подберёт курс, филиал и удобное время. Телефон{" "}
            <a className="underline decoration-bg/30 underline-offset-4" href={SITE.phoneHref}>
              {SITE.phone}
            </a>
            , почта {SITE.email}.
          </p>
        </div>
        <div className="overflow-hidden rounded-[20px] bg-surface">
          <iframe
            title="Запись на пробное занятие"
            src={SITE.trialForm}
            className="h-[540px] w-full border-0"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
