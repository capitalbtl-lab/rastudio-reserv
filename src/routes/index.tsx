import { createFileRoute } from "@tanstack/react-router";
import { SITE, SCHOOLS, PARTNER_LOGOS, BRANCHES, STATS, SHOWCASE, TICKER } from "@/data/site";
import { homePage, liteTeachers } from "@/data/lite";
import { pageHead } from "@/data/seo";
import { SiteShell } from "@/components/site-shell";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { TrialForm } from "@/components/trial-form";
import { Button } from "@/components/ui/button";
import { RobotEnglishVideos } from "@/components/robot-videos";
import { HeroCollage } from "@/components/hero-collage";
import { AgeChips } from "@/components/age-chips";
import { Reviews } from "@/components/reviews";
import { courseFacts } from "@/data/ages";
import { cn } from "@/lib/utils";

const home = homePage;

const teachers = liteTeachers
  .filter((t) => t.href !== "/team" && !/день открытых|дети развивайся/i.test(t.name))
  .slice(0, 8);

const STRIPS = [
  {
    href: "/parenttesting",
    title: "Тесты для родителей",
    text: home.paragraphs[7],
    image: home.images[8],
    cta: "Пройти тесты",
  },
  {
    href: "/charity",
    title: "Важные дела",
    text: home.paragraphs[8],
    image: {
      src: "https://static.wixstatic.com/media/4e33b6_e73db66828c94e8f87ddd27602c4138b~mv2.png/v1/fill/w_900,h_620,al_c,q_85,enc_avif,quality_auto/BlagoVsem.png",
      alt: "Благотворительные проекты Студии Развивайся",
      filename: "BlagoVsem (16).png",
    },
    cta: "Подробнее",
  },
  {
    href: "http://www.racamp.ru",
    title: "Летний городской лагерь",
    text: home.paragraphs[9],
    image: home.images[7],
    cta: "Сайт лагеря",
  },
  {
    href: "https://raedem.ru/artpeterburg",
    title: "Арт-поездки",
    text: home.paragraphs[10],
    image: home.images[9],
    cta: "Подробнее",
  },
  {
    href: "https://raedem.ru/artpeterburg",
    title: "Арт-экспедиции",
    text: home.paragraphs[11],
    image: home.images[4],
    cta: "Подробнее",
  },
  {
    href: "/tinkercad2025itogi",
    title: "Роботы будущего",
    text: home.paragraphs[13],
    image: {
      src: "/media/courses/tinkercad2025itogi/01.jpg",
      alt: "Конкурс «Роботы будущего» в Студии Развивайся",
      filename: "Конкурс по 3D моделированию в Тинкеркад (Коломна) (1).png",
    },
    cta: "Итоги конкурса",
  },
] as const;

export const Route = createFileRoute("/")({
  head: () => pageHead(home),
  component: Home,
});

function Home() {
  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "EducationalOrganization",
            name: SITE.name,
            url: SITE.domain,
            email: SITE.email,
            telephone: "+78005113401",
            image: SITE.logo.src,
            address: BRANCHES.map((b) => ({
              "@type": "PostalAddress",
              addressLocality: b.city,
              streetAddress: b.address,
              addressCountry: "RU",
            })),
          }),
        }}
      />

      <section className="ink relative isolate overflow-hidden text-header-fg">
        <div className="page-wrap grid items-center gap-10 py-16 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:min-h-[88dvh] lg:gap-8 lg:py-8">
          <div className="relative z-10 max-w-xl">
            <p className="hero-in kicker text-header-fg/55">Сеть школ · Коломна · Луховицы</p>
            <h1 className="hero-in hero-in-2 mt-5 text-[clamp(2.1rem,1.2rem+3vw,3.8rem)] leading-[1.05]">
              Ребёнок не просто учится — он создаёт, думает и развивается
            </h1>
            <p className="hero-in hero-in-3 mt-5 max-w-md text-[1.02rem] leading-relaxed text-header-fg/70">
              Семь школ искусств, инженерии и IT в одной сети. Пробное занятие — чтобы выбрать направление вместе.
            </p>
            <div className="hero-in hero-in-3 mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#trial">Пробное занятие</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <PageLink to="/allcourses">Смотреть курсы</PageLink>
              </Button>
            </div>
            <div className="mt-10 grid grid-cols-4 gap-3 border-t border-white/10 pt-6">
              {STATS.map((s) => (
                <div key={s.label}>
                  <p className="display text-xl tabular-nums md:text-2xl">{s.value}</p>
                  <p className="mt-1 text-[0.7rem] leading-snug text-header-fg/50 md:text-xs">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <HeroCollage />
        </div>
      </section>

      <div className="ink overflow-hidden border-y border-white/10 py-3 text-header-fg">
        <div className="marquee">
          <div className="marquee-track ticker-track items-center">
            {[...TICKER, ...TICKER].map((item, i) => (
              <span key={item + i} className="flex items-center gap-6 text-sm font-medium text-header-fg/55">
                {item}
                <span className="size-1 rounded-full bg-primary" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="page-wrap py-10 md:py-14">
        <p className="kicker text-primary">Подбор за 10 секунд</p>
        <h2 className="section-title mt-3">Сколько лет ребёнку?</h2>
        <p className="mt-3 max-w-xl text-muted">Школы остаются как были — это быстрый вход по возрасту.</p>
        <AgeChips className="mt-5" />
      </section>

      <section className="page-wrap py-16 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker text-primary">Семь школ одной сети</p>
            <h2 className="section-title mt-3">Выберите направление</h2>
          </div>
          <PageLink to="/allcourses" className="text-sm font-semibold text-primary">
            Все курсы
          </PageLink>
        </div>
        <div className="bento-schools mt-8">
          {SCHOOLS.map((school, i) => (
            <PageLink
              key={school.href}
              to={school.href}
              className={cn(
                "course-card course-reveal school-card group relative isolate min-h-56 overflow-hidden bg-header text-header-fg shadow-[var(--shadow-border)]",
                i === 0 && "bento-feature min-h-80",
                i >= 5 && "bento-wide",
              )}
            >
              <SeoImage
                src={school.image}
                alt={school.alt}
                filename={school.filename}
                className="course-media absolute inset-0 h-full w-full"
                imgClassName="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-header via-header/25 to-transparent" />
              <div className="course-copy relative flex h-full min-h-56 flex-col justify-end p-5 md:p-6">
                <span className="w-fit rounded-full bg-white/15 px-2.5 py-1 text-[0.7rem] font-semibold backdrop-blur-sm">
                  {school.kicker}
                </span>
                <h3 className={cn("display mt-3 leading-tight", i === 0 ? "text-3xl md:text-4xl" : "text-xl")}>
                  {school.label}
                </h3>
                <p className="mt-2 max-w-sm text-sm text-header-fg/80">{school.blurb}</p>
                <span className="course-cta text-header-fg">Смотреть школу</span>
              </div>
            </PageLink>
          ))}
        </div>
      </section>

      <section className="page-wrap pb-16 md:pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker text-primary">Каталог</p>
            <h2 className="section-title mt-3">Курсы сети «Развивайся»</h2>
          </div>
          <PageLink to="/allcourses" className="text-sm font-semibold text-primary">
            Открыть каталог
          </PageLink>
        </div>
        <div className="catalog-grid mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {SHOWCASE.map((course) => (
            <PageLink
              key={course.href}
              to={course.href}
              className="course-card course-reveal group overflow-hidden rounded-3xl bg-header text-header-fg shadow-[var(--shadow-border)]"
            >
              <SeoImage
                src={course.src}
                alt={course.alt}
                filename={course.filename}
                className="course-media aspect-4/5"
              />
              <div className="course-copy relative -mt-16 bg-gradient-to-t from-header via-header/80 to-transparent px-4 pb-4 pt-10">
                <p className="text-[0.7rem] font-semibold text-header-fg/65">
                  {courseFacts(course.href, course.age)}
                </p>
                <p className="display mt-1 text-lg leading-tight">{course.title}</p>
                <span className="course-cta text-header-fg">Смотреть курс</span>
              </div>
            </PageLink>
          ))}
        </div>
      </section>

      <section className="page-wrap pb-16 md:pb-24">
        <div className="grid items-center gap-8 overflow-hidden rounded-[2rem] bg-surface p-6 shadow-[var(--shadow-border)] md:grid-cols-2 md:gap-12 md:p-10">
          <div>
            <p className="kicker text-primary">О студии</p>
            <h2 className="section-title mt-3">Это студия «Развивайся»</h2>
            <p className="mt-5 text-[0.98rem] leading-relaxed text-muted">{home.paragraphs[0]}</p>
          </div>
          <SeoImage
            src="/courses/intro-computers.jpg"
            alt="Знакомство с компьютером и информационными технологиями в Коломне"
            filename="Развивайся - Знакомство с компьютером и информационными технологиями в Коломне.png"
            className="aspect-4/3 rounded-3xl bg-surface-2"
          />
        </div>
      </section>

      <section className="ink relative isolate mb-16 overflow-hidden text-header-fg md:mb-24">
        <div className="page-wrap relative grid items-center gap-10 py-16 md:grid-cols-2 md:gap-12 md:py-24">
          <div>
            <p className="kicker text-header-fg/55">Билингвальный курс</p>
            <h2 className="section-title mt-3">Робототехника на английском</h2>
            <p className="mt-5 max-w-md text-[0.98rem] leading-relaxed text-header-fg/75">
              {home.paragraphs[1]}
            </p>
            <Button asChild className="mt-8">
              <PageLink to="/roboticsinenglish">Подробнее о курсе</PageLink>
            </Button>
          </div>
          <RobotEnglishVideos />
        </div>
      </section>

      <section className="page-wrap pb-16 md:pb-24">
        <p className="kicker text-primary">Педагоги</p>
        <h2 className="section-title mt-3 max-w-3xl">Команда сильной сети школ</h2>
        <p className="mt-5 max-w-3xl text-[0.98rem] leading-relaxed text-muted">{home.paragraphs[2]}</p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 md:gap-4">
          {teachers.map((t) => (
            <PageLink
              key={t.href + t.name}
              to={t.href}
              className="group relative isolate overflow-hidden rounded-3xl bg-header"
            >
              <SeoImage
                src={t.photo}
                alt={t.alt}
                filename={t.filename}
                className="aspect-3/4"
                imgClassName="transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-header via-header/70 to-transparent p-4">
                <p className="text-sm font-semibold leading-snug text-header-fg">{t.name}</p>
                {t.role ? <p className="mt-1 line-clamp-2 text-xs text-header-fg/65">{t.role}</p> : null}
              </div>
            </PageLink>
          ))}
        </div>
        <div className="mt-7">
          <Button asChild variant="secondary">
            <PageLink to="/team">Все педагоги</PageLink>
          </Button>
        </div>
      </section>

      <Reviews />

      <section className="page-wrap pb-16 md:pb-24">
        <p className="kicker text-primary">Жизнь студии</p>
        <h2 className="section-title mt-3">Проекты и события</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STRIPS.map((story) => (
            <PageLink
              key={story.title}
              to={story.href}
              className="group overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-border-hover)]"
            >
              {story.image ? (
                <SeoImage
                  src={story.image.src}
                  alt={story.image.alt}
                  filename={story.image.filename}
                  className="aspect-video"
                  imgClassName="transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:scale-105"
                />
              ) : null}
              <div className="p-5">
                <h3 className="display text-xl leading-snug">{story.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-muted">{story.text}</p>
                <p className="mt-4 text-sm font-semibold text-primary">{story.cta}</p>
              </div>
            </PageLink>
          ))}
        </div>
      </section>

      <section className="ink overflow-hidden py-16 text-header-fg md:py-24">
        <div className="page-wrap">
          <p className="kicker text-header-fg/45">Три студии</p>
          <h2 className="section-title mt-3">Сеть в Коломне и Луховицах</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {BRANCHES.map((b) => (
              <div key={b.address} className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 md:p-7">
                <p className="kicker text-header-fg/45">{b.city}</p>
                <p className="display mt-3 text-2xl">{b.name}</p>
                <p className="mt-3 text-sm text-header-fg/75">{b.address}</p>
                <p className="mt-2 text-sm text-header-fg/50">{b.hours}</p>
                <p className="mt-4 text-sm leading-relaxed text-header-fg/65">{b.directions}</p>
                <a href={b.map} className="mt-5 inline-block text-sm font-semibold text-header-fg">
                  Смотреть на карте
                </a>
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-3xl text-sm leading-relaxed text-header-fg/55">{home.paragraphs[12]}</p>
        </div>
        <div className="marquee mt-12">
          <div className="marquee-track items-center">
            {[...PARTNER_LOGOS, ...PARTNER_LOGOS].map((logo, i) => (
              <SeoImage
                key={logo.src + i}
                src={logo.src}
                alt={logo.alt}
                filename={logo.filename}
                className="size-16 overflow-hidden rounded-xl bg-white md:size-[4.5rem]"
                imgClassName="object-contain p-1"
              />
            ))}
          </div>
        </div>
      </section>

      <section className="page-wrap py-16 md:py-20">
        <TrialForm />
      </section>
    </SiteShell>
  );
}
