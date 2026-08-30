import { useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { SITE, SCHOOLS } from "@/data/site";
import { Button } from "@/components/ui/button";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/allcourses", label: "Курсы" },
  { href: "/team", label: "Педагоги" },
  { href: "/master-class", label: "Мастер-классы" },
  { href: "/o-nas", label: "О студии" },
  { href: "/contacts", label: "Контакты" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [schoolsOpen, setSchoolsOpen] = useState(false);

  return (
    <header className="ink sticky top-0 z-40 border-b border-white/10 bg-header/90 text-header-fg backdrop-blur-xl">
      <div className="page-wrap flex h-16 items-center gap-3 md:h-[4.25rem]">
        <PageLink to="/" className="flex shrink-0 items-center gap-3" onClick={() => setOpen(false)}>
          <SeoImage
            src={SITE.logo.src}
            alt={SITE.logo.alt}
            filename={SITE.logo.filename}
            className="size-10 overflow-hidden rounded-md bg-header md:size-11"
            imgClassName="object-cover"
            width={88}
            height={88}
            loading="eager"
          />
          <span className="display text-[1.05rem] tracking-tight md:text-lg">Развивайся</span>
        </PageLink>

        <nav className="ml-4 hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setSchoolsOpen(true)}
            onMouseLeave={() => setSchoolsOpen(false)}
          >
            <button
              type="button"
              className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-header-fg/75 hover:bg-white/10 hover:text-header-fg"
              aria-expanded={schoolsOpen}
              onClick={() => setSchoolsOpen((v) => !v)}
            >
              Школы <ChevronDown className="size-3.5 opacity-70" />
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
            <PageLink
              key={item.href}
              to={item.href}
              className="inline-flex h-11 items-center rounded-full px-3 text-sm font-medium text-header-fg/75 hover:bg-white/10 hover:text-header-fg"
            >
              {item.label}
            </PageLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href={SITE.phoneHref}
            className="hidden tabular-nums text-sm font-medium text-header-fg/70 hover:text-header-fg xl:inline"
          >
            {SITE.phone}
          </a>
          <Button asChild size="sm" className="hidden md:inline-flex">
            <a href="#trial">Запись</a>
          </Button>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-white/10 lg:hidden"
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="max-h-[min(80dvh,calc(100dvh-4rem))] overflow-y-auto border-t border-white/10 bg-header px-4 py-4 lg:hidden">
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
            {LINKS.map((item) => (
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
            <a href={SITE.cabinet} className="text-sm text-header-fg/70">
              Личный кабинет
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
