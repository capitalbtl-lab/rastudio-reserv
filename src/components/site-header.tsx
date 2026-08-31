import { useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { SITE, SCHOOLS } from "@/data/site";
import { AGE_BANDS } from "@/data/ages";
import { Button } from "@/components/ui/button";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/allcourses", label: "Курсы" },
  { href: "/schedule", label: "Расписание" },
  { href: "/team", label: "Педагоги" },
] as const;

const MORE = [
  { href: "/master-class", label: "Мастер-классы" },
  { href: "/o-nas", label: "О студии" },
  { href: "/contacts", label: "Контакты" },
] as const;

const navItem =
  "inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[0.95rem] font-medium text-header-fg/78 transition-colors hover:bg-white/10 hover:text-header-fg";

const ghostBtn =
  "inline-flex h-8 items-center rounded-full bg-white/[0.07] px-3.5 text-[0.78rem] font-semibold tracking-wide text-header-fg ring-1 ring-inset ring-white/14 transition-colors hover:bg-white/14";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [schoolsOpen, setSchoolsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <header className="ink fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-header/95 text-header-fg backdrop-blur-xl">
      <div className="border-b border-white/8">
        <div className="page-wrap flex h-10 items-center justify-between gap-3">
          <a
            href={SITE.phoneHref}
            className="hidden text-[0.8rem] font-medium tabular-nums tracking-wide text-header-fg/65 hover:text-header-fg sm:inline"
          >
            {SITE.phone}
          </a>
          <div className="ml-auto flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <a href={SITE.maxBot} target="_blank" rel="noreferrer" className={ghostBtn}>
              Админ-бот
            </a>
            <a href={SITE.telegram} target="_blank" rel="noreferrer" className={ghostBtn}>
              Telegram
            </a>
            <a href={SITE.cabinet} target="_blank" rel="noreferrer" className={ghostBtn}>
              Личный кабинет
            </a>
            <a
              href="#trial"
              className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-[0.78rem] font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Запись
            </a>
          </div>
        </div>
      </div>

      <div className="page-wrap flex h-[4.6rem] items-center gap-4 md:h-[5.35rem] md:gap-6">
        <PageLink to="/" className="flex shrink-0 items-center" onClick={() => setOpen(false)}>
          <img
            src="/brand/logo-white.png"
            alt="Студия Развивайся — искусства и интеллектуальное развитие"
            width={1200}
            height={289}
            className="h-11 w-auto max-w-[16rem] object-contain object-left outline-none sm:h-12 sm:max-w-[18rem] md:h-14 md:max-w-[22rem] lg:h-[3.9rem] lg:max-w-[24rem]"
            loading="eager"
            decoding="async"
          />
        </PageLink>

        <nav className="hidden min-w-0 flex-1 items-center justify-end gap-0.5 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setSchoolsOpen(true)}
            onMouseLeave={() => setSchoolsOpen(false)}
          >
            <button
              type="button"
              className={navItem}
              aria-expanded={schoolsOpen}
              onClick={() => setSchoolsOpen((v) => !v)}
            >
              Школы <ChevronDown className="ml-1 size-3.5 opacity-70" />
            </button>
            <div
              className={cn(
                "absolute left-0 top-full z-50 w-[min(38rem,calc(100vw-2rem))] origin-top pt-2 transition-[opacity,transform] duration-[var(--motion-fast)] ease-[var(--ease-smooth-out)]",
                schoolsOpen
                  ? "visible translate-y-0 opacity-100"
                  : "invisible -translate-y-1 opacity-0",
              )}
            >
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface p-2 text-fg shadow-[var(--shadow-border-hover)]">
                {SCHOOLS.map((school) => (
                  <PageLink
                    key={school.href}
                    to={school.href}
                    className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2"
                  >
                    <SeoImage
                      src={school.image}
                      alt={school.alt}
                      filename={school.filename}
                      className="size-12 shrink-0 overflow-hidden rounded-lg bg-surface-2"
                    />
                    <span>
                      <span className="block text-sm font-semibold leading-snug">{school.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{school.kicker}</span>
                    </span>
                  </PageLink>
                ))}
              </div>
            </div>
          </div>
          {LINKS.map((item) => (
            <PageLink key={item.href} to={item.href} className={navItem}>
              {item.label}
            </PageLink>
          ))}
          <div
            className="relative"
            onMouseEnter={() => setMoreOpen(true)}
            onMouseLeave={() => setMoreOpen(false)}
          >
            <button
              type="button"
              className={navItem}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              Ещё <ChevronDown className="ml-1 size-3.5 opacity-70" />
            </button>
            <div
              className={cn(
                "absolute right-0 top-full z-50 min-w-[13rem] origin-top pt-2 transition-[opacity,transform] duration-[var(--motion-fast)] ease-[var(--ease-smooth-out)]",
                moreOpen
                  ? "visible translate-y-0 opacity-100"
                  : "invisible -translate-y-1 opacity-0",
              )}
            >
              <div className="grid gap-0.5 rounded-2xl bg-surface p-1.5 text-fg shadow-[var(--shadow-border-hover)]">
                {MORE.map((item) => (
                  <PageLink
                    key={item.href}
                    to={item.href}
                    className="rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-2"
                  >
                    {item.label}
                  </PageLink>
                ))}
              </div>
            </div>
          </div>
        </nav>

        <button
          type="button"
          className="ml-auto inline-flex size-11 items-center justify-center rounded-full hover:bg-white/10 lg:hidden"
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="max-h-[min(80dvh,calc(100dvh-7rem))] overflow-y-auto border-t border-white/10 bg-header px-4 py-4 lg:hidden">
          <p className="mb-2 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-header-fg/45">
            Возраст ребёнка
          </p>
          <div className="mb-3 flex flex-wrap gap-2 px-1">
            {AGE_BANDS.map((band) => (
              <PageLink
                key={band.id}
                to={`/allcourses?age=${band.id}`}
                className="inline-flex h-9 items-center rounded-full bg-white/10 px-3 text-sm font-medium hover:bg-white/16"
                onClick={() => setOpen(false)}
              >
                {band.label}
              </PageLink>
            ))}
          </div>
          <p className="mb-2 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-header-fg/45">
            Школы
          </p>
          <div className="grid gap-0.5">
            {SCHOOLS.map((school) => (
              <PageLink
                key={school.href}
                to={school.href}
                className="rounded-xl px-3 py-3 text-sm font-medium hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {school.label}
                <span className="mt-0.5 block text-xs font-normal text-header-fg/55">
                  {school.kicker}
                </span>
              </PageLink>
            ))}
          </div>
          <div className="mt-3 grid gap-0.5 border-t border-white/10 pt-3">
            {[...LINKS, ...MORE].map((item) => (
              <PageLink
                key={item.href}
                to={item.href}
                className="rounded-xl px-3 py-3 text-sm font-medium hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </PageLink>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 px-1">
            <a href={SITE.phoneHref} className="text-sm font-semibold">
              {SITE.phone}
            </a>
            <Button asChild>
              <a href="#trial" onClick={() => setOpen(false)}>
                Запись на пробное занятие
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
