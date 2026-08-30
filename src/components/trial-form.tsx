import { SITE } from "@/data/site";

export function TrialForm({ compact = false }: { compact?: boolean }) {
  return (
    <section
      id="trial"
      className="ink overflow-hidden rounded-3xl px-6 py-10 text-header-fg md:px-10 md:py-12"
    >
      <div className={`grid gap-8 ${compact ? "" : "lg:grid-cols-[1fr_1.1fr] lg:items-start"}`}>
        <div>
          <p className="kicker text-header-fg/50">Пробное занятие</p>
          <h2 className="display mt-3 max-w-md text-3xl text-header-fg md:text-4xl">
            Приведите ребёнка на первое занятие
          </h2>
          <p className="mt-4 max-w-md text-pretty text-header-fg/70">
            Оставьте заявку — администратор подберёт курс, филиал и удобное время. Телефон{" "}
            <a className="underline decoration-header-fg/30 underline-offset-4" href={SITE.phoneHref}>
              {SITE.phone}
            </a>
            , почта {SITE.email}.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl bg-bg">
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
