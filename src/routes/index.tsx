import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { SITE, SCHOOLS, STATS, MOMENTS, PARTNER_LOGOS, BRANCHES } from "@/data/site";
import { homePage, liteTeachers } from "@/data/lite";
import { pageHead } from "@/data/seo";
import { SiteShell } from "@/components/site-shell";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { TrialForm } from "@/components/trial-form";
import { Button } from "@/components/ui/button";

const home = homePage;
const hero = home.images[0];

const teachers = liteTeachers
  .filter((t) => t.href !== "/team" && !/день открытых|дети развивайся/i.test(t.name))
  .slice(0, 8);

const STORIES = [
  {
    href: "/parenttesting",
    title: "ТЕСТЫ ДЛЯ РОДИТЕЛЕЙ УЧЕНИКОВ СТУДИИ",
    text: home.paragraphs[7],
  },
  {
    href: "/charity",
    title: 'ПРОЕКТ "РАЗВИВАЙСЯ | ВАЖНЫЕ ДЕЛА"',
    text: home.paragraphs[8],
  },
  {
    href: "http://www.racamp.ru",
    title: "ЛЕТНИЙ ГОРОДСКОЙ ЛАГЕРЬ 2026",
    text: home.paragraphs[9],
  },
  {
    href: "https://raedem.ru/artpeterburg",
    title: "АРТ-ПОЕЗДКИ, РАЗВИВАЮЩИЕ ИНТЕЛЛЕКТ И РАСШИРЯЮЩИЕ ГОРИЗОНТЫ ПОЗНАНИЯ.",
    text: home.paragraphs[10],
  },
  {
    href: "/tinkercad2025itogi",
    title: "АРТ-ЭКСПЕДИЦИИ ПО ГОРОДАМ РОССИИ ДЛЯ ЮНЫХ ХУДОЖНИКОВ!",
    text: home.paragraphs[11],
  },
  {
    href: "/tinkercad2025itogi",
    title: "ВНУТРЕННЕЕ СОРЕВНОВАНИЕ СТУДИИ «РАЗВИВАЙСЯ» ПО 3D-МОДЕЛИРОВАНИЮ В TINKERCAD: «РОБОТЫ БУДУЩЕГО»",
    text: home.paragraphs[13],
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

      <section className="relative isolate min-h-[78vh] overflow-hidden bg-fg text-bg">
        {hero ? (
          <SeoImage
            src={hero.src}
            alt={hero.alt}
            filename={hero.filename}
            className="absolute inset-0 h-full w-full"
            imgClassName="h-full w-full object-cover opacity-55"
            loading="eager"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-fg via-fg/55 to-fg/25" />
        <div className="relative mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-end px-4 pb-12 pt-28 md:px-6 md:pb-16">
          <p className="text-sm font-medium tracking-[0.18em] text-bg/70">КОЛОМНА · ЛУХОВИЦЫ · С 2016</p>
          <h1 className="display mt-4 max-w-4xl text-3xl leading-[1.05] md:text-6xl">{home.h1}</h1>
          <p className="mt-6 max-w-2xl text-base text-bg/80 md:text-lg">{home.paragraphs[0]}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#trial">Запись на пробное</a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <PageLink to="/allcourses">Все курсы</PageLink>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="-mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[28px] bg-border shadow-[var(--shadow-border)] md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-surface px-5 py-6">
              <p className="display text-3xl md:text-4xl">{s.value}</p>
              <p className="mt-1 text-sm text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Семь школ</p>
            <h2 className="display mt-2 text-3xl md:text-4xl">ИННОВАЦИОННЫЕ КУРСЫ И МЕТОДИКИ</h2>
          </div>
          <PageLink to="/allcourses" className="inline-flex h-11 items-center gap-1 text-sm font-medium">
            Каталог <ArrowUpRight className="size-4" />
          </PageLink>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCHOOLS.map((school) => (
            <PageLink
              key={school.href}
              to={school.href}
              className="group overflow-hidden rounded-[24px] bg-surface shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:shadow-[var(--shadow-border-hover)]"
            >
              <SeoImage
                src={school.image}
                alt={school.alt}
                filename={school.filename}
                className="aspect-[16/10] bg-surface-2"
                imgClassName="transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:scale-105"
              />
              <div className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{school.kicker}</p>
                <h3 className="mt-1 text-lg font-medium">{school.label}</h3>
                <p className="mt-2 text-sm text-muted">{school.blurb}</p>
              </div>
            </PageLink>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <div className="grid gap-8 overflow-hidden rounded-[32px] bg-surface p-6 shadow-[var(--shadow-border)] md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <div>
            <h2 className="display text-3xl md:text-4xl">ЭТО СТУДИЯ "РАЗВИВАЙСЯ"</h2>
            <p className="mt-5 text-muted">{home.paragraphs[0]}</p>
          </div>
          <SeoImage
            src="https://static.wixstatic.com/media/4e33b6_eb555f99b54f42c982dad487e1515bbf~mv2.jpg/v1/fit/w_960,h_639,q_90,enc_avif,quality_auto/4e33b6_eb555f99b54f42c982dad487e1515bbf~mv2.jpg"
            alt="Дети разных возрастов увлеченно программируют в Студии Развивайся в Коломне и Луховицах"
            filename="4e33b6_eb555f99b54f42c982dad487e1515bbf~mv2.jpg"
            className="aspect-[4/3] rounded-[24px] bg-surface-2"
          />
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <SeoImage
            src="https://static.wixstatic.com/media/11062b_cbf9e55659a847c6a58580d9fa1beefef000.jpg/v1/fill/w_900,h_648,al_c,q_85,enc_avif,quality_auto/11062b_cbf9e55659a847c6a58580d9fa1beefef000.jpg"
            alt="11062b_cbf9e55659a847c6a58580d9fa1beefef000.jpg"
            filename="11062b_cbf9e55659a847c6a58580d9fa1beefef000.jpg"
            className="aspect-[4/3] rounded-[28px] bg-surface-2"
          />
          <div>
            <h2 className="display text-3xl md:text-4xl">РОБОТОТЕХНИКА НА АНГЛИЙСКОМ ЯЗЫКЕ</h2>
            <p className="mt-5 text-muted">{home.paragraphs[1]}</p>
            <Button asChild className="mt-6">
              <PageLink to="/roboticsinenglish">Подробнее о курсе</PageLink>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <h2 className="display max-w-3xl text-3xl md:text-4xl">
          КОМАНДА ПРОФЕССИОНАЛОВ ДЛЯ НАИЛУЧШЕГО РЕЗУЛЬТАТА ОБУЧЕНИЯ
        </h2>
        <p className="mt-5 max-w-3xl text-muted">{home.paragraphs[2]}</p>
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {teachers.map((t) => (
            <PageLink key={t.href + t.name} to={t.href} className="overflow-hidden rounded-[20px] bg-surface shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:shadow-[var(--shadow-border-hover)]">
              <SeoImage src={t.photo} alt={t.alt} filename={t.filename} className="aspect-[3/4]" />
              <div className="p-3">
                <p className="text-xs font-medium leading-snug">{t.name}</p>
                {t.role ? <p className="mt-1 line-clamp-2 text-xs text-muted">{t.role}</p> : null}
              </div>
            </PageLink>
          ))}
        </div>
        <div className="mt-5">
          <Button asChild variant="secondary">
            <PageLink to="/team">Все педагоги</PageLink>
          </Button>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <h2 className="display text-3xl md:text-4xl">Проекты, которые живут рядом с учёбой</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {MOMENTS.map((m) => (
            <PageLink
              key={m.href}
              to={m.href}
              className="overflow-hidden rounded-[24px] bg-surface shadow-[var(--shadow-border)]"
            >
              <SeoImage src={m.image} alt={m.alt} filename={m.filename} className="aspect-square" />
              <div className="p-5">
                <h3 className="text-lg font-medium">{m.title}</h3>
                <p className="mt-2 text-sm text-muted">{m.blurb}</p>
              </div>
            </PageLink>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <div className="space-y-4">
          {STORIES.map((story) => (
            <article
              key={story.title}
              className="rounded-[24px] bg-surface p-6 shadow-[var(--shadow-border)] md:p-8"
            >
              <h2 className="display text-2xl md:text-3xl">{story.title}</h2>
              <p className="mt-4 max-w-3xl text-muted">{story.text}</p>
              <PageLink to={story.href} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Подробнее <ArrowUpRight className="size-4" />
              </PageLink>
            </article>
          ))}
          <article className="rounded-[24px] bg-surface p-6 shadow-[var(--shadow-border)] md:p-8">
            <h2 className="display text-2xl md:text-3xl">КОРПОРАТИВНОЕ СОТРУДНИЧЕСТВО</h2>
            <p className="mt-4 max-w-3xl text-muted">{home.paragraphs[12]}</p>
          </article>
          <article className="rounded-[24px] bg-surface p-6 shadow-[var(--shadow-border)] md:p-8">
            <h2 className="display text-2xl md:text-3xl">НАШИ КОРПОРАТИВНЫЕ КЛИЕНТЫ</h2>
            <p className="mt-4 max-w-3xl text-muted">{home.paragraphs[14]}</p>
          </article>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <p className="text-sm font-medium text-primary">Филиалы</p>
        <h2 className="display mt-2 text-3xl md:text-4xl">Коломна и Луховицы</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {BRANCHES.map((b) => (
            <div key={b.address} className="rounded-[24px] bg-surface p-6 shadow-[var(--shadow-border)]">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">{b.city}</p>
              <p className="display mt-2 text-2xl">{b.name}</p>
              <p className="mt-3 text-sm">{b.address}</p>
              <p className="mt-2 text-sm text-muted">{b.hours}</p>
              <a href={b.map} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Карта <ArrowUpRight className="size-4" />
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <h2 className="display text-2xl">Студия "Развивайся" - с 2016 года</h2>
        <p className="mt-3 text-sm font-medium text-muted">НАШИ КОРПОРАТИВНЫЕ КЛИЕНТЫ</p>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          {PARTNER_LOGOS.map((logo) => (
            <SeoImage
              key={logo.src}
              src={logo.src}
              alt={logo.alt}
              filename={logo.filename}
              className="size-16 overflow-hidden rounded-2xl bg-surface"
              imgClassName="object-contain p-1"
            />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 md:px-6">
        <TrialForm />
      </section>
    </SiteShell>
  );
}
