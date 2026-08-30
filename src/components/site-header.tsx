import { useState } from "react";
import { Menu, X } from "lucide-react";
import { SITE, NAV, SCHOOLS } from "@/data/site";
import { Button } from "@/components/ui/button";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [schoolsOpen, setSchoolsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:h-[4.25rem] md:px-6">
        <PageLink to="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <SeoImage
            src={SITE.logo.src}
            alt={SITE.logo.alt}
            filename={SITE.logo.filename}
            className="size-10 overflow-hidden rounded-xl"
            imgClassName="object-cover"
            width={80}
            height={80}
            loading="eager"
          />
          <span className="display text-lg leading-none tracking-tight">Развивайся</span>
        </PageLink>

        <nav className="ml-auto hidden items-center gap-1 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setSchoolsOpen(true)}
            onMouseLeave={() => setSchoolsOpen(false)}
          >
            <button
              type="button"
              className="h-11 rounded-full px-3 text-sm font-medium text-fg/80 hover:bg-surface-2 hover:text-fg"
            >
              Школы
            </button>
            <div
              className={cn(
                "absolute left-0 top-full w-[22rem] rounded-[20px] bg-surface p-2 shadow-[var(--shadow-border-hover)] transition-opacity duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                schoolsOpen ? "visible opacity-100" : "invisible opacity-0",
              )}
            >
              {SCHOOLS.map((school) => (
                <PageLink
                  key={school.href}
                  to={school.href}
                  className="block rounded-xl px-3 py-2.5 hover:bg-surface-2"
                >
                  <span className="block text-sm font-medium">{school.label}</span>
                  <span className="block text-xs text-muted">{school.kicker}</span>
                </PageLink>
              ))}
            </div>
          </div>
          {NAV.map((item) => (
            <PageLink
              key={item.href}
              to={item.href}
              className="inline-flex h-11 items-center rounded-full px-3 text-sm font-medium text-fg/80 hover:bg-surface-2 hover:text-fg"
            >
              {item.label}
            </PageLink>
          ))}
        </nav>

        <a
          href={SITE.phoneHref}
          className="ml-auto hidden text-sm font-medium tabular-nums text-fg/80 md:block lg:ml-4"
        >
          {SITE.phone}
        </a>
        <Button asChild size="sm" className="hidden md:inline-flex">
          <a href="#trial">Пробное занятие</a>
        </Button>
        <button
          type="button"
          className="ml-auto inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2 lg:hidden"
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border bg-bg px-4 py-4 lg:hidden">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Школы</p>
          <div className="grid gap-1">
            {SCHOOLS.map((school) => (
              <PageLink
                key={school.href}
                to={school.href}
                className="rounded-xl px-3 py-3 text-sm font-medium hover:bg-surface-2"
                onClick={() => setOpen(false)}
              >
                {school.label}
              </PageLink>
            ))}
          </div>
          <div className="mt-3 grid gap-1 border-t border-border pt-3">
            {NAV.map((item) => (
              <PageLink
                key={item.href}
                to={item.href}
                className="rounded-xl px-3 py-3 text-sm font-medium hover:bg-surface-2"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </PageLink>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <a href={SITE.phoneHref} className="text-sm font-medium">
              {SITE.phone}
            </a>
            <Button asChild>
              <a href="#trial" onClick={() => setOpen(false)}>
                Пробное занятие
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
