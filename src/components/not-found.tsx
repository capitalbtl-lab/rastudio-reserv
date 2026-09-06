import { SiteShell } from "@/components/site-shell";
import { PageLink } from "@/components/page-link";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <SiteShell>
      <section className="ink relative isolate overflow-hidden text-header-fg">
        <div className="page-wrap grid items-center gap-10 py-16 md:py-20 lg:min-h-[70dvh] lg:py-8">
          <div className="relative z-10 max-w-xl">
            <p className="kicker text-header-fg/55">404</p>
            <h1 className="mt-5 text-[clamp(2.1rem,1.2rem+3vw,3.8rem)] leading-[1.05]">Страница не найдена</h1>
            <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-header-fg/70">
              Этот адрес не входит в карту сайта. Откройте каталог курсов или вернитесь на главную.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <PageLink to="/">На главную</PageLink>
              </Button>
              <Button asChild size="lg" variant="outline">
                <PageLink to="/allcourses">Все курсы</PageLink>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
