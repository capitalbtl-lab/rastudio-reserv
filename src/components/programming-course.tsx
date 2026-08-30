import type { SitePage } from "@/data/catalog";
import type { CmsCourse, CmsSession } from "@/data/cms";
import { inkOn } from "@/data/cms";
import { SITE } from "@/data/site";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { TrialForm } from "@/components/trial-form";
import { Button } from "@/components/ui/button";
import {
  BulletList,
  CmsImg,
  Kicker,
  ProseBlocks,
  ScheduleBlock,
  Trajectory,
} from "@/components/cms-blocks";

type Props = {
  page: SitePage;
  course: CmsCourse;
  schedule: CmsSession[];
};

export function ProgrammingCoursePage({ page, course, schedule }: Props) {
  const hero =
    course.banner ||
    course.gallery[0] ||
    (page.images[0]
      ? { src: page.images[0].src, filename: page.images[0].filename, alt: page.images[0].alt }
      : null);
  const accent = course.accent || "#205EDC";

  return (
    <article>
      <section className="ink relative isolate min-h-[70dvh] overflow-hidden text-header-fg">
        {hero ? (
          <div className="pointer-events-none absolute inset-0 flex justify-center">
            <SeoImage
              src={hero.src}
              alt={hero.alt || course.name}
              filename={hero.filename}
              className="h-full aspect-3/4 max-w-full"
              imgClassName="h-full w-full object-cover opacity-70"
              loading="eager"
            />
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/25" />
        <div className="relative mx-auto flex min-h-[70dvh] max-w-[1180px] flex-col justify-end px-4 pb-28 pt-24 md:px-5 md:pb-16">
          <p className="text-sm font-medium text-header-fg/80">
            <PageLink to="/" className="hover:underline">
              Главная
            </PageLink>
            <span className="mx-2 text-header-fg/45">/</span>
            <PageLink to="/programming-school" className="hover:underline">
              Школа программирования
            </PageLink>
          </p>
          <div className="mt-6 flex items-end gap-5">
            {course.logo ? (
              <CmsImg
                image={course.logo}
                className="hidden size-20 overflow-hidden bg-bg/10 sm:block md:size-24"
                alt={course.name}
                loading="eager"
              />
            ) : null}
            <div>
              <p className="kicker text-header-fg/70">{course.age}</p>
              <h1 className="hero-title mt-3 max-w-4xl">{course.name}</h1>
              {course.program ? (
                <p className="mt-4 max-w-2xl text-base text-header-fg/80 md:text-lg">{course.program}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#trial">Запись на пробное занятие</a>
            </Button>
            <Button asChild size="lg">
              <a href="#modules">Модули курса</a>
            </Button>
          </div>
        </div>
      </section>

      {course.aboutLead ? (
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-[1180px] px-4 py-10 md:px-5 md:py-14">
            <p className="display max-w-4xl text-2xl leading-snug md:text-3xl">{course.aboutLead}</p>
            {course.resultLevel ? (
              <p className="mt-5 max-w-3xl text-muted">{course.resultLevel}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="mx-auto max-w-[1180px] space-y-16 px-4 py-12 md:px-5 md:py-16">
        <section>
          <Kicker>О курсе</Kicker>
          <h2 className="display section-title mt-2">{course.aboutTitle}</h2>
          <ProseBlocks text={course.aboutBody} className="mt-6 max-w-3xl" />
          {course.aboutBody2 ? <ProseBlocks text={course.aboutBody2} className="mt-4 max-w-3xl" /> : null}
        </section>

        {course.trajectory.length ? (
          <section>
            <Kicker>Траектория</Kicker>
            <h2 className="display section-title mt-2">{course.trajectoryTitle}</h2>
            {course.trajectoryText ? (
              <ProseBlocks text={course.trajectoryText} className="mt-5 max-w-3xl" />
            ) : null}
            <div className="mt-8">
              <Trajectory steps={course.trajectory} currentName={course.name} />
            </div>
          </section>
        ) : null}

        <section
          className="overflow-hidden rounded-lg"
          style={{ background: course.audienceColor || accent, color: course.audienceTextColor }}
        >
          <div className="grid md:grid-cols-2">
            <div className="p-6 md:p-10">
              <p className="kicker opacity-80">{course.audienceTitle}</p>
              <h2 className="display mt-3 text-2xl md:text-3xl">{course.audienceForTitle}</h2>
              <div className="mt-6">
                <BulletList items={course.audienceFor} light />
              </div>
            </div>
            <div
              className="p-6 md:p-10"
              style={{ background: "color-mix(in oklab, black 14%, transparent)" }}
            >
              <h2 className="display text-2xl md:text-3xl">{course.audienceSkillsTitle}</h2>
              <div className="mt-6">
                <BulletList items={course.audienceSkills} light />
              </div>
            </div>
          </div>
        </section>

        {course.audienceNote ? (
          <p className="max-w-3xl text-muted">{course.audienceNote}</p>
        ) : null}

        {course.programText ? (
          <section>
            <Kicker>Программа</Kicker>
            <h2 className="display section-title mt-2">{course.programTitle}</h2>
            <ProseBlocks text={course.programText} className="mt-6 max-w-3xl" />
          </section>
        ) : null}

        <section id="modules">
          <Kicker>Модули</Kicker>
          <h2 className="display section-title mt-2">{course.modulesTitle}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {course.modules.map((mod) => {
              const color = mod.color || accent;
              const ink = mod.textColor && mod.textColor !== "#FFFFFF" ? mod.textColor : inkOn(color);
              return (
                <article
                  key={mod.id}
                  className="relative overflow-hidden rounded-lg"
                  style={{ background: color, color: ink }}
                >
                  {mod.bg ? (
                    <CmsImg
                      image={mod.bg}
                      className="absolute inset-0 opacity-25"
                      imgClassName="h-full w-full object-cover"
                    />
                  ) : null}
                  <div className="relative grid gap-4 p-5 md:grid-cols-[1fr_7.5rem] md:p-6">
                    <div>
                      <p className="kicker opacity-80">Модуль {String(mod.order).padStart(2, "0")}</p>
                      <h3 className="display mt-2 text-xl leading-snug md:text-2xl">{mod.title}</h3>
                      <div className="mt-4">
                        <BulletList items={mod.theses} light />
                      </div>
                    </div>
                    {mod.image ? (
                      <CmsImg
                        image={mod.image}
                        className="aspect-square overflow-hidden rounded-md bg-black/10"
                        alt={mod.title}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <Kicker>Результат</Kicker>
          <h2 className="display section-title mt-2">{course.goalsTitle}</h2>
          {course.goalsText ? <ProseBlocks text={course.goalsText} className="mt-6 max-w-3xl" /> : null}
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <OutcomeCard title="Результат обучения" items={course.resultText} image={course.resultImage} />
            <OutcomeCard title="Перспективы" items={course.prospectsText} image={course.prospectsImage} />
            <OutcomeCard title="Почему этот курс" items={course.whyText} image={course.whyImage} />
          </div>
        </section>

        {(course.formatText1 || course.formatText2) && (
          <section>
            <Kicker>Формат</Kicker>
            <h2 className="display section-title mt-2">{course.formatTitle}</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {course.formatText1 ? (
                <div className="rounded-lg bg-surface p-6 shadow-[var(--shadow-border)]">
                  <ProseBlocks text={course.formatText1} />
                </div>
              ) : null}
              {course.formatText2 ? (
                <div className="rounded-lg bg-surface p-6 shadow-[var(--shadow-border)]">
                  <ProseBlocks text={course.formatText2} />
                </div>
              ) : null}
            </div>
            {course.formatText3 ? (
              <ProseBlocks text={course.formatText3} className="mt-6 max-w-3xl" />
            ) : null}
          </section>
        )}

        <ScheduleBlock sessions={schedule} />

        <p className="text-sm text-muted">
          Вопросы по программе:{" "}
          <a href={SITE.phoneHref} className="font-medium text-fg">
            {SITE.phone}
          </a>
        </p>
      </div>

      <section className="mx-auto max-w-[1180px] px-4 pb-16 md:px-5">
        <TrialForm />
      </section>
    </article>
  );
}

function OutcomeCard({
  title,
  items,
  image,
}: {
  title: string;
  items: string[];
  image: CmsCourse["resultImage"];
}) {
  if (!items.length) return null;
  return (
    <article className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-border)]">
      <CmsImg image={image} className="aspect-4/3 bg-surface-2" alt={title} />
      <div className="p-5">
        <h3 className="display text-xl">{title}</h3>
        <div className="mt-4">
          <BulletList items={items} />
        </div>
      </div>
    </article>
  );
}
