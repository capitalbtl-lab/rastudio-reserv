import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { SITE, BRANCHES, COURSE_GROUPS } from "@/data/site";
import type { CourseCard, SitePage, TeacherCard } from "@/data/catalog";
import type { CmsCourse, CmsMaster, CmsSession, CmsTrajectoryStep } from "@/data/cms";
import { PageLink } from "@/components/page-link";
import { SeoImage } from "@/components/seo-image";
import { TrialForm } from "@/components/trial-form";
import { ProgrammingCoursePage } from "@/components/programming-course";
import { MasterClassPage, MasterListPageCms } from "@/components/master-class";
import { ScheduleBlock, CoursePageHero, CourseStory, RelatedAgeCourses, SchoolCourseList, Trajectory } from "@/components/cms-blocks";
import { PhotoSlider } from "@/components/photo-slider";
import { PageReviews } from "@/components/reviews";
import { ConvertBand, ConvertAside } from "@/components/convert";
import { CourseSellAfterWhy, CourseSellAfterProgram } from "@/components/course-sell";
import { courseOfferFacts } from "@/data/ages";
import { galleryPhotos } from "@/lib/gallery";
import { SCHOOL_PROGRAMS, SCHOOL_WHY, COURSE_STORY } from "@/data/school-programs";
import { whyForPath } from "@/data/course-why";
import { breadcrumbJsonLd, courseJsonLd } from "@/data/seo";
import { JsonLd } from "@/components/json-ld";
import { AGE_BANDS, agesOverlap, coursePlace, ageBadge, courseNameOnly } from "@/data/ages";
import { AgeChips } from "@/components/age-chips";
import { CoursePrice } from "@/components/course-price";
import { trialCourseForPath } from "@/data/trial";
import { hydrateEdits, pageEdit, type EditsStore } from "@/data/edits-core";
import { cn } from "@/lib/utils";

type MasterCard = { path: string; h1: string };

export type PageArticleProps = {
  page: SitePage;
  teachers?: TeacherCard[];
  courses?: CourseCard[];
  masters?: MasterCard[];
  cmsCourse?: CmsCourse | null;
  cmsMaster?: CmsMaster | null;
  cmsCourses?: CmsCourse[];
  cmsMasters?: CmsMaster[];
  trajectory?: CmsTrajectoryStep[];
  schedule?: CmsSession[];
  edits?: EditsStore;
};

function Gallery({ page }: { page: SitePage }) {
  if (!page.images.length) return null;
  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2">
      {page.images.slice(0, 8).map((img) => (
        <SeoImage
          key={img.src}
          src={img.src}
          alt={img.alt}
          filename={img.filename}
          className="aspect-4/3 rounded-lg bg-surface-2"
        />
      ))}
    </div>
  );
}

function Related({ page, courses }: { page: SitePage; courses: CourseCard[] }) {
  const heading = splitCourseHeading(page.h1);
  const current = courses.find((c) => c.href === page.path || c.href === page.pathDecoded);
  return (
    <RelatedAgeCourses
      currentPath={current?.href || page.pathDecoded || page.path}
      currentAge={heading.age || current?.age}
      courses={courses}
    />
  );
}

function Breadcrumb({ page, onDark = false }: { page: SitePage; onDark?: boolean }) {
  const tone = onDark ? "text-bg/80" : "text-primary";
  const sep = onDark ? "text-bg/45" : "text-muted";
  return (
    <p className={`text-sm font-medium ${tone}`}>
      <PageLink to="/" className="hover:underline">
        Главная
      </PageLink>
      <span className={`mx-2 ${sep}`}>/</span>
      {page.kind === "teacher" ? (
        <PageLink to="/team" className="hover:underline">
          Педагоги
        </PageLink>
      ) : page.kind === "master" ? (
        <PageLink to="/master-class" className="hover:underline">
          Мастер-классы
        </PageLink>
      ) : (
        <PageLink to="/allcourses" className="hover:underline">
          Курсы
        </PageLink>
      )}
    </p>
  );
}

export function PageArticle({
  page,
  teachers = [],
  courses = [],
  masters = [],
  cmsCourse = null,
  cmsMaster = null,
  cmsCourses = [],
  cmsMasters = [],
  trajectory = [],
  schedule = [],
  edits,
}: PageArticleProps) {
  if (edits) hydrateEdits(edits);
  const path = page.pathDecoded || page.path;
  const seo = (
    <>
      <JsonLd data={breadcrumbJsonLd(path, page.h1 || page.title)} />
      <JsonLd data={courseJsonLd({ ...page, path, h1: page.h1 })} />
    </>
  );
  if (cmsCourse) {
    return (
      <>
        {seo}
        <ProgrammingCoursePage page={page} course={cmsCourse} schedule={schedule} courses={courses} teachers={teachers} />
      </>
    );
  }
  if (cmsMaster) {
    return (
      <>
        {seo}
        <MasterClassPage page={page} master={cmsMaster} />
      </>
    );
  }
  if (page.kind === "team")
    return (
      <>
        {seo}
        <TeamPage page={page} teachers={teachers} />
      </>
    );
  if (page.kind === "catalog")
    return (
      <>
        {seo}
        <CatalogPage page={page} courses={courses} />
      </>
    );
  if (page.kind === "contacts")
    return (
      <>
        {seo}
        <ContactsPage page={page} />
      </>
    );
  if (page.kind === "master-list") {
    return (
      <>
        {seo}
        {cmsMasters.length ? (
          <MasterListPageCms page={page} masters={cmsMasters} />
        ) : (
          <MasterListPage page={page} masters={masters} />
        )}
      </>
    );
  }

  const cinematic = ["course", "school", "teacher", "master"].includes(page.kind);
  if (cinematic) {
    return (
      <>
        {seo}
        <CinematicPage page={page} schedule={schedule} courses={courses} trajectory={trajectory} teachers={teachers} />
      </>
    );
  }

  return (
    <>
      {seo}
      <PlainPage page={page} schedule={schedule} courses={courses} />
    </>
  );
}

function splitCourseHeading(h1: string) {
  const cleaned = h1.replace(/\u200b/g, " ").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^(.*?)\s+(Для детей\b.*)$/i);
  if (match) return { title: match[1], age: match[2] };
  return { title: cleaned, age: null as string | null };
}

function CinematicPage({
  page,
  schedule,
  courses,
  trajectory = [],
  teachers = [],
}: {
  page: SitePage;
  schedule: CmsSession[];
  courses: CourseCard[];
  trajectory?: CmsTrajectoryStep[];
  teachers?: TeacherCard[];
}) {
  const heading = splitCourseHeading(page.h1);
  const path = page.pathDecoded || page.path;
  const current = courses.find((c) => c.href === path);
  const age = heading.age || current?.age || null;
  const edit = pageEdit(path);
  const body = edit.about ? [edit.about] : COURSE_STORY[path] ?? page.paragraphs;

  return (
    <article>
      <CoursePageHero
        kicker={
          <>
            <PageLink to="/" className="hover:underline">
              Главная
            </PageLink>
            <span className="mx-2 text-header-fg/35">/</span>
            <PageLink to="/allcourses" className="hover:underline">
              Курсы
            </PageLink>
          </>
        }
        age={age}
        title={heading.title}
        description={page.description}
        images={galleryPhotos(page.images, page.pathDecoded || page.path, "hero")}
        video={page.video}
        facts={
          page.kind === "course" || page.kind === "school"
            ? courseOfferFacts(page.pathDecoded || page.path, age)
            : undefined
        }
        path={page.kind === "course" || page.kind === "school" ? page.pathDecoded || page.path : undefined}
      />
      {page.kind === "course" || page.kind === "school" ? (
        <ConvertBand path={page.pathDecoded || page.path} sessions={schedule} />
      ) : null}

      <div className="page-wrap py-12 md:py-16">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            <CourseStory
              paragraphs={body}
              headings={page.headings}
              program={SCHOOL_PROGRAMS[path]}
              why={(whyForPath(path) || SCHOOL_WHY[path])?.items ?? null}
              whyTitle={(whyForPath(path) || SCHOOL_WHY[path])?.heading}
              afterLead={
                page.kind === "school" ? (
                  <SchoolCourseList schoolPath={page.pathDecoded || page.path} courses={courses} />
                ) : null
              }
            />
            {page.kind === "school" || page.kind === "course" ? (
              <PhotoSlider images={galleryPhotos(page.images, page.pathDecoded || page.path, "gallery")} />
            ) : (
              <Gallery page={{ ...page, images: page.images.slice(Math.min(3, page.images.length)) }} />
            )}
            {page.kind === "course" ? (
              <div className="mt-12 space-y-12">
                <CourseSellAfterWhy path={page.pathDecoded || page.path} />
                <CourseSellAfterProgram path={page.pathDecoded || page.path} teachers={teachers} />
              </div>
            ) : null}
            {trajectory.length ? (
              <section className="pt-12">
                <p className="kicker">Траектория</p>
                <h2 className="display mt-2 text-2xl md:text-3xl">Ребёнок последовательно проходит путь</h2>
                <div className="mt-8">
                  <Trajectory steps={trajectory} />
                </div>
              </section>
            ) : null}
            {page.kind === "school" || page.kind === "course" ? (
              <PageReviews path={page.pathDecoded || page.path} />
            ) : null}
            {schedule.length ? (
              <div className="pt-10">
                <ScheduleBlock sessions={schedule} />
              </div>
            ) : null}
            {page.kind === "school" ? null : <Related page={page} courses={courses} />}
          </div>
          <ConvertAside />
        </div>
        <div className="mt-16">
          <TrialForm compact courseId={trialCourseForPath(page.pathDecoded || page.path)} />
        </div>
      </div>
    </article>
  );
}

function PlainPage({
  page,
  schedule,
  courses = [],
}: {
  page: SitePage;
  schedule: CmsSession[];
  courses?: CourseCard[];
}) {
  const hero = page.images[0];
  const body = page.paragraphs;

  return (
    <article className="mx-auto max-w-[1180px] px-4 py-12 md:px-5 md:py-16">
      <Breadcrumb page={page} />
      <div className="mt-6 grid items-end gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h1 className="display text-4xl md:text-5xl">{page.h1}</h1>
          {page.description ? (
            <p className="mt-5 max-w-2xl text-lg text-muted">{page.description}</p>
          ) : null}
        </div>
        {hero ? (
          <SeoImage
            src={hero.src}
            alt={hero.alt}
            filename={hero.filename}
            className="aspect-4/3 rounded-lg bg-surface-2"
            loading="eager"
          />
        ) : null}
      </div>
      <div className="mt-12 max-w-3xl space-y-5 text-lg leading-relaxed text-fg/90">
        {body.map((p) => (
          <p key={p.slice(0, 48)}>{p}</p>
        ))}
      </div>
      <Gallery page={page} />
      {schedule.length ? (
        <div className="mt-12">
          <ScheduleBlock sessions={schedule} />
        </div>
      ) : null}
      <Related page={page} courses={courses} />
      <div className="mt-16">
        <TrialForm compact />
      </div>
    </article>
  );
}

function TeamPage({ page, teachers }: { page: SitePage; teachers: TeacherCard[] }) {
  return (
    <article className="mx-auto max-w-[1180px] px-4 py-12 md:px-5 md:py-16">
      <h1 className="display section-title">{page.h1}</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">{page.paragraphs[0] || page.description}</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teachers.map((t) => (
          <PageLink
            key={t.href + t.name}
            to={t.href}
            className="group overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-border-hover)]"
          >
            <SeoImage
              src={t.photo}
              alt={t.alt}
              filename={t.filename}
              className="aspect-4/5 bg-surface-2"
              imgClassName="transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:scale-105"
            />
            <div className="p-4">
              <p className="font-medium">{t.name}</p>
              <p className="mt-1 text-sm text-muted">{t.role}</p>
            </div>
          </PageLink>
        ))}
      </div>
      <div className="mt-16">
        <TrialForm compact />
      </div>
    </article>
  );
}

function CatalogPage({ page, courses }: { page: SitePage; courses: CourseCard[] }) {
  const search = useSearch({ strict: false }) as { age?: string; city?: string };
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<(typeof COURSE_GROUPS)[number]["id"]>("all");
  const [age, setAge] = useState(search.age || "");
  const [city, setCity] = useState(search.city || "");

  useEffect(() => {
    if (search.age) setAge(search.age);
  }, [search.age]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const g = COURSE_GROUPS.find((item) => item.id === group) ?? COURSE_GROUPS[0];
    const band = AGE_BANDS.find((item) => item.id === age);
    return courses.filter((c) => {
      if (!g.test(c.href)) return false;
      if (band && !agesOverlap(`${c.age || ""} ${c.label} ${c.title}`, band.min, band.max)) return false;
      if (city && !coursePlace(c.href).includes(city)) return false;
      if (!s) return true;
      return (
        c.label.toLowerCase().includes(s) ||
        c.title.toLowerCase().includes(s) ||
        c.description.toLowerCase().includes(s) ||
        (c.age || "").toLowerCase().includes(s)
      );
    });
  }, [q, courses, group, age, city]);

  return (
    <article className="mx-auto max-w-[1180px] px-4 py-12 md:px-5 md:py-16">
      <h1 className="display section-title">{page.h1}</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">{page.description || page.paragraphs[0]}</p>
      <p className="mt-8 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">Возраст</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAge("")}
          className={cn(
            "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold",
            !age ? "bg-fg text-bg" : "bg-surface shadow-[var(--shadow-border)]",
          )}
        >
          Все
        </button>
        <AgeChips active={age} />
      </div>
      <p className="mt-6 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">Город</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {["", "Коломна", "Луховицы"].map((item) => (
          <button
            key={item || "all"}
            type="button"
            onClick={() => setCity(item)}
            className={cn(
              "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold",
              city === item ? "bg-fg text-bg" : "bg-surface shadow-[var(--shadow-border)]",
            )}
          >
            {item || "Все города"}
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {COURSE_GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setGroup(item.id)}
            className={cn(
              "h-11 rounded-sm px-4 text-sm font-medium",
              group === item.id
                ? "bg-fg text-bg"
                : "bg-surface text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="mt-6 block">
        <span className="sr-only">Поиск курса</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти курс, возраст или направление"
          className="h-12 w-full max-w-md rounded-sm border border-border bg-surface px-5 text-sm shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <div className="catalog-grid mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <PageLink
            key={c.href}
            to={c.href}
            className="course-card course-reveal group flex flex-col overflow-hidden rounded-[1.6rem] bg-surface shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
          >
            {c.image ? (
              <SeoImage
                src={c.image}
                alt={c.alt}
                filename={c.filename}
                className="course-media aspect-[4/3] bg-surface-2"
              />
            ) : (
              <div className="course-media aspect-[4/3] bg-surface-2" />
            )}
            <div className="flex flex-1 flex-col p-5">
              {ageBadge(c.age, c.label) ? (
                <p className="w-fit rounded-full bg-primary/10 px-3 py-1 text-[0.82rem] font-semibold text-primary md:text-[0.9rem]">
                  {ageBadge(c.age, c.label)}
                </p>
              ) : null}
              <p className="display mt-3 text-[1.2rem] leading-snug md:text-[1.35rem]">{courseNameOnly(c.label, c.age)}</p>
              <CoursePrice path={c.href} tone="card" />
              <span className="mt-auto pt-5 text-sm font-semibold text-primary">Смотреть курс →</span>
            </div>
          </PageLink>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="mt-10 text-sm text-muted">По этому запросу курсов нет — попробуйте другое слово.</p>
      ) : null}
      <div className="mt-16">
        <TrialForm compact />
      </div>
    </article>
  );
}

function ContactsPage({ page }: { page: SitePage }) {
  return (
    <article className="mx-auto max-w-[1180px] px-4 py-12 md:px-5 md:py-16">
      <h1 className="display section-title">{page.h1}</h1>
      <p className="mt-5 max-w-3xl text-lg text-muted">
        Три студии в Коломне и Луховицах. Запись:{" "}
        <a href={SITE.phoneHref} className="whitespace-nowrap text-fg">
          {SITE.phone}
        </a>
        ,{" "}
        <a href={`mailto:${SITE.email}`} className="whitespace-nowrap">
          {SITE.email}
        </a>
        .
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {BRANCHES.map((b) => (
          <div key={b.address} className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-border)]">
            <iframe
              title={`Карта: ${b.name}`}
              src={b.mapEmbed}
              className="h-64 w-full border-0 md:h-72"
              loading="lazy"
            />
            <div className="p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">{b.city}</p>
              <h2 className="display mt-2 text-2xl">{b.name}</h2>
              <p className="mt-3 text-sm">{b.address}</p>
              <p className="mt-2 text-sm text-muted">{b.hours}</p>
              <p className="mt-3 text-sm text-muted">{b.note}</p>
              <p className="mt-3 text-sm">{b.directions}</p>
              <a href={b.map} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                Открыть карту
              </a>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-16">
        <TrialForm />
      </div>
    </article>
  );
}

function MasterListPage({ page, masters }: { page: SitePage; masters: MasterCard[] }) {
  return (
    <article className="mx-auto max-w-[1180px] px-4 py-12 md:px-5 md:py-16">
      <h1 className="display section-title">{page.h1}</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">{page.paragraphs[0] || page.description}</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {masters.map((item) => (
          <PageLink
            key={item.path}
            to={item.path}
            className="rounded-lg bg-surface px-4 py-4 shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
          >
            {item.h1}
          </PageLink>
        ))}
      </div>
      <Gallery page={page} />
      <div className="mt-16">
        <TrialForm compact />
      </div>
    </article>
  );
}
