import { useMemo, useState } from "react";
import { SITE, BRANCHES } from "@/data/site";
import { allCourses, allPages, allTeachers, type SitePage } from "@/data/catalog";
import { PageLink } from "@/components/page-link";
import { SeoImage } from "@/components/seo-image";
import { TrialForm } from "@/components/trial-form";
import { Button } from "@/components/ui/button";

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
          className="aspect-[4/3] rounded-[20px] bg-surface-2"
        />
      ))}
    </div>
  );
}

function Related({ page }: { page: SitePage }) {
  if (!page.related.length) return null;
  return (
    <div className="mt-12">
      <h2 className="display text-2xl">Ещё по теме</h2>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {page.related.map((link) => (
          <li key={link.href + link.text}>
            <PageLink
              to={link.href}
              className="block rounded-2xl bg-surface px-4 py-3 shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
            >
              {link.text}
            </PageLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PageArticle({ page }: { page: SitePage }) {
  const hero = page.images[0];
  const body = page.paragraphs;

  if (page.kind === "team") return <TeamPage page={page} />;
  if (page.kind === "catalog") return <CatalogPage page={page} />;
  if (page.kind === "contacts") return <ContactsPage page={page} />;
  if (page.kind === "master-list") return <MasterListPage page={page} />;

  return (
    <article className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <p className="text-sm font-medium text-primary">
        <PageLink to="/" className="hover:underline">
          Главная
        </PageLink>
        <span className="mx-2 text-muted">/</span>
        {page.kind === "teacher" ? (
          <PageLink to="/team" className="hover:underline">
            Педагоги
          </PageLink>
        ) : (
          <PageLink to="/allcourses" className="hover:underline">
            Курсы
          </PageLink>
        )}
      </p>
      <div className="mt-6 grid items-end gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h1 className="display text-4xl md:text-5xl">{page.h1}</h1>
          {page.description ? (
            <p className="mt-5 max-w-2xl text-lg text-muted">{page.description}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <a href="#trial">Записаться</a>
            </Button>
            <Button asChild variant="secondary">
              <a href={SITE.phoneHref}>{SITE.phone}</a>
            </Button>
          </div>
        </div>
        {hero ? (
          <SeoImage
            src={hero.src}
            alt={hero.alt}
            filename={hero.filename}
            className="aspect-[4/3] rounded-[28px] bg-surface-2"
            loading="eager"
          />
        ) : null}
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-5 text-[1.05rem] leading-relaxed text-fg/90">
          {body.map((p) => (
            <p key={p.slice(0, 48)}>{p}</p>
          ))}
          {page.headings.length ? (
            <div className="mt-10 rounded-[24px] bg-surface p-6 shadow-[var(--shadow-border)]">
              <h2 className="display text-2xl">Программа</h2>
              <ol className="mt-4 space-y-3">
                {page.headings.map((h, i) => (
                  <li key={h.text} className="flex gap-3 text-sm md:text-base">
                    <span className="font-display text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span>{h.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <Gallery page={page} />
          <Related page={page} />
        </div>
        <aside className="h-fit rounded-[24px] bg-surface p-5 shadow-[var(--shadow-border)]">
          <p className="text-sm font-medium">Запись и филиалы</p>
          <p className="mt-2 text-sm text-muted">
            {SITE.phone}
            <br />
            {SITE.email}
          </p>
          <ul className="mt-4 space-y-3 text-sm text-muted">
            {BRANCHES.map((b) => (
              <li key={b.address}>
                <span className="font-medium text-fg">{b.city}</span>
                <br />
                {b.address}
              </li>
            ))}
          </ul>
          <Button asChild className="mt-5 w-full">
            <a href="#trial">Пробное занятие</a>
          </Button>
        </aside>
      </div>
      <div className="mt-16">
        <TrialForm compact />
      </div>
    </article>
  );
}

function TeamPage({ page }: { page: SitePage }) {
  const teachers = allTeachers();
  return (
    <article className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <h1 className="display text-4xl md:text-5xl">{page.h1}</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        {page.paragraphs[0] || page.description}
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teachers.map((t) => (
          <PageLink
            key={t.href + t.name}
            to={t.href}
            className="group overflow-hidden rounded-[24px] bg-surface shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-border-hover)]"
          >
            <SeoImage
              src={t.photo}
              alt={t.alt}
              filename={t.filename}
              className="aspect-[4/5] bg-surface-2"
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

function CatalogPage({ page }: { page: SitePage }) {
  const courses = allCourses();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return courses;
    return courses.filter(
      (c) =>
        c.label.toLowerCase().includes(s) ||
        c.title.toLowerCase().includes(s) ||
        c.description.toLowerCase().includes(s),
    );
  }, [q, courses]);

  return (
    <article className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <h1 className="display text-4xl md:text-5xl">{page.h1}</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">{page.description || page.paragraphs[0]}</p>
      <label className="mt-8 block">
        <span className="sr-only">Поиск курса</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти курс, возраст или направление"
          className="h-12 w-full max-w-md rounded-full border border-border bg-surface px-5 text-sm shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <PageLink
            key={c.href}
            to={c.href}
            className="overflow-hidden rounded-[24px] bg-surface shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-border-hover)]"
          >
            {c.image ? (
              <SeoImage
                src={c.image}
                alt={c.alt}
                filename={c.filename}
                className="aspect-[16/10] bg-surface-2"
              />
            ) : (
              <div className="aspect-[16/10] bg-surface-2" />
            )}
            <div className="p-4">
              <p className="font-medium">{c.label}</p>
              <p className="mt-2 line-clamp-3 text-sm text-muted">{c.description}</p>
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

function ContactsPage({ page }: { page: SitePage }) {
  return (
    <article className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <h1 className="display text-4xl md:text-5xl">{page.h1}</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        Три студии в Коломне и Луховицах. Запись: {SITE.phone}, {SITE.email}.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {BRANCHES.map((b) => (
          <div key={b.address} className="rounded-[24px] bg-surface p-6 shadow-[var(--shadow-border)]">
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
        ))}
      </div>
      <div className="mt-16">
        <TrialForm />
      </div>
    </article>
  );
}

function MasterListPage({ page }: { page: SitePage }) {
  const masters = allPages().filter((p) => p.kind === "master");
  return (
    <article className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <h1 className="display text-4xl md:text-5xl">{page.h1}</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">{page.paragraphs[0] || page.description}</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {masters.map((item) => (
          <PageLink
            key={item.path}
            to={item.path}
            className="rounded-[20px] bg-surface px-4 py-4 shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
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
