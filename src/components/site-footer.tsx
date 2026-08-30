import { SITE, BRANCHES, FOOTER_LINKS, SCHOOLS } from "@/data/site";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-surface-2/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-4 md:px-6">
        <div className="md:col-span-1">
          <PageLink to="/" className="flex items-center gap-3">
            <SeoImage
              src={SITE.logo.src}
              alt={SITE.logo.alt}
              filename={SITE.logo.filename}
              className="size-10 overflow-hidden rounded-xl"
              width={80}
              height={80}
            />
            <span className="display text-lg">Развивайся</span>
          </PageLink>
          <p className="mt-4 text-sm text-muted">
            Студия искусств и интеллектуального развития. Коломна и Луховицы, с 2016 года.
          </p>
          <p className="mt-4 text-sm font-medium">
            <a href={SITE.phoneHref}>{SITE.phone}</a>
            <br />
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Школы</p>
          <ul className="mt-3 space-y-2 text-sm">
            {SCHOOLS.map((s) => (
              <li key={s.href}>
                <PageLink to={s.href} className="hover:text-primary">
                  {s.label}
                </PageLink>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Студия</p>
          <ul className="mt-3 space-y-2 text-sm">
            {FOOTER_LINKS.map((s) => (
              <li key={s.href}>
                <PageLink to={s.href} className="hover:text-primary">
                  {s.label}
                </PageLink>
              </li>
            ))}
            <li>
              <a href={SITE.camp} className="hover:text-primary">
                Летний лагерь
              </a>
            </li>
            <li>
              <a href={SITE.cabinet} className="hover:text-primary">
                Личный кабинет
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Филиалы</p>
          <ul className="mt-3 space-y-4 text-sm">
            {BRANCHES.map((b) => (
              <li key={b.address}>
                <p className="font-medium">{b.city}</p>
                <p className="text-muted">{b.address}</p>
                <a href={b.map} className="text-primary hover:underline">
                  Карта
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted md:flex-row md:items-center md:justify-between md:px-6">
          <p>© {new Date().getFullYear()} Студия «Развивайся». Все права защищены.</p>
          <p>
            <a href={SITE.telegram}>Telegram</a>
            <span className="mx-2">·</span>
            <a href={SITE.vk}>ВКонтакте</a>
            <span className="mx-2">·</span>
            <a href={SITE.maxBot}>MAX-бот</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
