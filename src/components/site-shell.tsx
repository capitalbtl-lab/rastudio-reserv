import { useEffect, useRef, type ReactNode } from "react";
import { SITE } from "@/data/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { bindIntersection } from "@/lib/intersection";
import { organizationJsonLd } from "@/data/seo";
import { JsonLd } from "@/components/json-ld";
import { AgentChat } from "@/components/agent-chat";

export function SiteShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return bindIntersection(rootRef.current);
  }, []);

  return (
    <div ref={rootRef} className="min-h-dvh bg-bg text-fg">
      <JsonLd data={organizationJsonLd()} />
      <a className="skip-link" href="#content">
        К содержанию
      </a>
      <SiteHeader />
      <div className="h-[3.75rem] bg-header sm:h-[4.75rem] md:h-[5.25rem]" aria-hidden />
      <main id="content" className="pb-24 md:pb-0">
        {children}
      </main>
      <SiteFooter />
      <div className="mobile-dock fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-bg/95 px-3 py-2.5 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-3 gap-2">
          <Button asChild variant="secondary" className="h-11 w-full text-[0.78rem]">
            <a href={SITE.phoneHref}>Позвонить</a>
          </Button>
          <Button asChild variant="secondary" className="h-11 w-full text-[0.78rem]">
            <a href={SITE.telegram} target="_blank" rel="noreferrer">
              Написать
            </a>
          </Button>
          <Button asChild className="h-11 w-full text-[0.78rem]">
            <a href="#trial">Пробное</a>
          </Button>
        </div>
      </div>
      <AgentChat />
    </div>
  );
}
