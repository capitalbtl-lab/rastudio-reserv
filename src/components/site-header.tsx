import { useState } from "react";
import { Menu, X, ChevronDown, ChevronRight } from "lucide-react";
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
  { href: "/master-class", label: "Мастер-классы" },
  { href: "/o-nas", label: "О студии" },
  { href: "/contacts", label: "Контакты" },
] as const;

const UTILITY = [
  {
    href: SITE.maxBot,
    label: "Подключиться к админ-боту",
    short: "Админ-бот",
    className: "bg-[#7b3d9e] hover:bg-[#6c348c]",
    external: true,
  },
  {
    href: SITE.telegram,
    label: "Telegram канал",
    short: "Telegram",
    className: "bg-[#2eb8b0] hover:bg-[#269ea7]",
    external: true,
  },
  {
    href: "#trial",
    label: "Запись на пробное",
    short: "Запись",
    className: "bg-[#2eb8b0] hover:bg-[#269ea7]",
    external: false,
  },
  {
    href: SITE.cabinet,
    label: "Личный кабинет",
    short: "Кабинет",
    className: "bg-[#2eb8b0] hover:bg-[#269ea7]",
    external: true,
  },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [schoolsOpen, setSchoolsOpen] = useState(false);

  return (
    <header className="ink sticky top-0 z-40 border-b border-white/10 bg-header/90 text-header-fg backdrop-blur-xl">
      <div className="border-b border-white/10 bg-header">
        <div className="page-wrap flex h-10 items-center justify-end gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {UTILITY.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer" : undefined}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-0.5 rounded-full px-3 text-[0.72rem] font-semibold text-white transition-colors sm:h-8 sm:px-3.5 sm:text-[0.8rem]",
                item.className,
              )}
            >
              <span className="sm:hidden">{item.short}</span>
              <span className="hidden sm:inline">{item.label}</span>
              <ChevronRight className="size-3.5 opacity-80" />
            </a>
          ))}
        </div>
      </div>
      <div className="page-wrap flex h-[4.25rem] items-center gap-3 md:h-[4.75rem]">
        <PageLink to="/" className="flex shrink-0 items-center" onClick={() => setOpen(false)}>
          <img
            src="/brand/logo-white.png"
            alt="Студия Развивайся — искусства и интеллектуальное развитие"
            width={1200}
            height={289}
            className="h-9 w-auto max-w-[11rem] object-contain object-left outline-none sm:h-10 sm:max-w-[13.5rem] md:h-11 md:max-w-[16rem] lg:h-12 lg:max-w-[18rem]"
            loading="eager"
            decoding="async"
          />
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
            className="hidden tabular-nums text-sm font-medium text-header-fg/70 hover:text-header-fg lg:inline"
          >
            {SITE.phone}
          </a>
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
            <a href={SITE.cabinet} className="text-sm font-semibold">
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
