import { SITE, BRANCHES, FOOTER_LINKS, SCHOOLS } from "@/data/site";
import { PageLink } from "@/components/page-link";

export function SiteFooter() {
  return (
    <footer className="ink mt-8 overflow-hidden text-header-fg md:mt-12">
      <div className="page-wrap grid gap-10 py-14 md:grid-cols-4 md:py-16">
        <div>
          <PageLink to="/" className="inline-flex items-center">
            <img
              src="/brand/logo-white.png"
              alt="Студия Развивайся — искусства и интеллектуальное развитие"
              width={1200}
              height={289}
              className="h-12 w-auto max-w-[17rem] object-contain object-left outline-none"
              decoding="async"
            />
          </PageLink>
          <p className="mt-4 text-sm leading-relaxed text-header-fg/65">
            Студия искусств и интеллектуального развития. Коломна и Луховицы, с 2016 года.
          </p>
          <p className="mt-4 text-sm font-medium">
            <a href={SITE.phoneHref}>{SITE.phone}</a>
            <br />
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          </p>
        </div>
        {BRANCHES.map((b) => (
          <div key={b.address}>
            <p className="kicker text-header-fg/45">{b.city}</p>
            <p className="mt-3 text-sm font-semibold leading-snug">{b.name}</p>
            <p className="mt-2 text-sm leading-relaxed text-header-fg/70">{b.address}</p>
            <p className="mt-2 text-sm text-header-fg/55">{b.hours}</p>
            <a
              href={b.map}
              className="mt-3 inline-block text-sm font-semibold underline decoration-header-fg/25 underline-offset-4 hover:decoration-header-fg"
            >
              Посмотреть на карте
            </a>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="page-wrap flex flex-col gap-4 py-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-header-fg/70">
            {SCHOOLS.map((s) => (
              <PageLink key={s.href} to={s.href} className="hover:text-header-fg">
                {s.label}
              </PageLink>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-header-fg/70">
            {FOOTER_LINKS.map((s) => (
              <PageLink key={s.href} to={s.href} className="hover:text-header-fg">
                {s.label}
              </PageLink>
            ))}
            <a href={SITE.camp} className="hover:text-header-fg">
              Летний лагерь
            </a>
            <a href={SITE.cabinet} className="hover:text-header-fg">
              Личный кабинет
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="page-wrap flex flex-col gap-3 py-5 text-xs text-header-fg/50 md:flex-row md:items-center md:justify-between">
          <p>© 2016–{new Date().getFullYear()} Студия «Развивайся». Все права защищены.</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <a href={SITE.telegram}>Telegram</a>
            <span>·</span>
            <a href={SITE.vk}>ВКонтакте</a>
            <span>·</span>
            <a href={SITE.maxBot}>MAX-бот</a>
            <PageLink
              to="/admin"
              className="ml-1 inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-[0.72rem] font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Кабинет
            </PageLink>
          </p>
        </div>
      </div>
    </footer>
  );
}
