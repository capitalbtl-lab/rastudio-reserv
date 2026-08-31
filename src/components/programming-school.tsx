import type { CourseCard, SitePage, TeacherCard } from "@/data/catalog";
import type { CmsCourse, CmsSession, CmsTrajectoryStep } from "@/data/cms";
import { isPublishedTeacher } from "@/data/catalog";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { TrialForm } from "@/components/trial-form";
import { Button } from "@/components/ui/button";
import { Kicker, ScheduleBlock, Trajectory, SchoolCourseList, ProgramSteps } from "@/components/cms-blocks";
import { SCHOOL_PROGRAMS } from "@/data/school-programs";
import { PhotoSlider } from "@/components/photo-slider";
import { PageReviews } from "@/components/reviews";
import { galleryPhotos } from "@/lib/gallery";

type Props = {
  page: SitePage;
  courses: CmsCourse[];
  catalogCourses?: CourseCard[];
  trajectory: CmsTrajectoryStep[];
  schedule: CmsSession[];
  teachers: TeacherCard[];
};

export function ProgrammingSchoolPage({
  page,
  catalogCourses = [],
  trajectory,
  schedule,
  teachers,
}: Props) {
  const hero = page.images[0];
  const itTeachers = teachers
    .filter(isPublishedTeacher)
    .filter((t) => /python|c\+\+|программ|godot|unity|scratch|it |айти|gamedev|код/i.test(`${t.name} ${t.role}`))
    .slice(0, 8);

  return (
    <article>
      <section className="ink relative isolate min-h-[70dvh] overflow-hidden text-header-fg">
        {hero ? (
          <SeoImage
            src={hero.src}
            alt={hero.alt}
            filename={hero.filename}
            className="absolute inset-0 h-full w-full"
            imgClassName="h-full w-full object-cover opacity-50"
            loading="eager"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/20" />
        <div className="relative mx-auto flex min-h-[70dvh] max-w-[1180px] flex-col justify-end px-4 pb-28 pt-24 md:px-5 md:pb-16">
          <p className="kicker text-header-fg/70">Коломна · Луховицы · 5–16 лет</p>
          <h1 className="hero-title mt-4 max-w-5xl">{page.h1}</h1>
          <p className="mt-5 max-w-2xl text-base text-header-fg/80 md:text-lg">
            {page.description ||
              "Образовательная траектория в сфере информационных технологий: от первых шагов в цифре до Python, Unity и C++."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#courses">Выбрать курс</a>
            </Button>
            <Button asChild size="lg">
              <a href="#trial">Запись на пробное занятие</a>
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1180px] space-y-16 px-4 py-12 md:px-5 md:py-16">
        <section>
          <Kicker>Система, не набор кружков</Kicker>
          <h2 className="display section-title mt-2 max-w-3xl">
            Не просто курсы, а система обучения, выстроенная под ребёнка и реальный IT-мир
          </h2>
          <p className="mt-5 max-w-3xl text-muted">
            {page.paragraphs[0] ||
              "Ребёнок последовательно проходит путь: от понимания логики и цифровой среды — к созданию игр и проектов — к разработке и алгоритмам высокого уровня."}
          </p>
        </section>

        <section id="courses">
          <SchoolCourseList schoolPath="/programming-school" courses={catalogCourses} wide />
        </section>

        <ProgramSteps items={SCHOOL_PROGRAMS["/programming-school"] ?? []} />

        {trajectory.length ? (
          <section>
            <Kicker>6 ступеней</Kicker>
            <h2 className="display section-title mt-2">Ребёнок последовательно проходит путь</h2>
            <div className="mt-8">
              <Trajectory steps={trajectory} />
            </div>
          </section>
        ) : null}

        {itTeachers.length ? (
          <section>
            <Kicker>Педагоги</Kicker>
            <h2 className="display section-title mt-2">
              Команда педагогов школы программирования
            </h2>
            <div className="snap-row mt-8">
              {itTeachers.map((t) => (
                <PageLink
                  key={t.href + t.name}
                  to={t.href}
                  className="snap-card overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-border)]"
                >
                  <SeoImage src={t.photo} alt={t.alt} filename={t.filename} className="aspect-3/4" />
                  <div className="p-3">
                    <p className="text-sm font-medium leading-snug">{t.name}</p>
                    {t.role ? <p className="mt-1 line-clamp-2 text-xs text-muted">{t.role}</p> : null}
                  </div>
                </PageLink>
              ))}
            </div>
            <div className="mt-5">
              <Button asChild size="lg">
                <PageLink to="/team">Все педагоги</PageLink>
              </Button>
            </div>
          </section>
        ) : null}

        <PhotoSlider images={galleryPhotos(page.images)} />

        <PageReviews path="/programming-school" />

        <ScheduleBlock sessions={schedule} />
      </div>

      <section className="mx-auto max-w-[1180px] px-4 pb-16 md:px-5">
        <TrialForm />
      </section>
    </article>
  );
}
