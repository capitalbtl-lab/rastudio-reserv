"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { SITE } from "@/data/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { bindIntersection } from "@/lib/intersection";
import { organizationJsonLd } from "@/data/seo";
import { JsonLd } from "@/components/json-ld";
import { tickBehavior } from "@/data/page-behavior";
import { TabError } from "@/lib/error-component";

function AgentChatLazy() {
  const [Chat, setChat] = useState<ComponentType | null>(null);
  useEffect(() => {
    void import("@/components/agent-chat")
      .then((m) => setChat(() => m.AgentChat))
      .catch(() => undefined);
  }, []);
  if (!Chat) return null;
  return <Chat />;
}

function DebugDockLazy() {
  const [Dock, setDock] = useState<ComponentType<{ startAsk?: boolean }> | null>(null);
  const [startAsk, setStartAsk] = useState(false);
  useEffect(() => {
    const load = (ask?: boolean) => {
      if (ask) setStartAsk(true);
      void import("@/components/debug-dock").then((m) => setDock(() => m.DebugDock)).catch(() => undefined);
    };
    try {
      if (sessionStorage.getItem("ra_debug")) load();
    } catch {
      /* */
    }
    const onOpen = () => load(true);
    window.addEventListener("ra-debug-open", onOpen);
    return () => window.removeEventListener("ra-debug-open", onOpen);
  }, []);
  if (!Dock) return null;
  return <Dock startAsk={startAsk} />;
}

export function SiteShell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return bindIntersection(rootRef.current);
  }, []);

  useEffect(() => {
    tickBehavior();
    const id = window.setInterval(() => tickBehavior(), 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div ref={rootRef} className="min-h-dvh bg-bg text-fg">
      <JsonLd data={organizationJsonLd()} />
      <a className="skip-link" href="#content">
        К содержанию
      </a>
      <SiteHeader />
      <div className="h-[3.75rem] bg-header sm:h-[4.75rem] md:h-[5.25rem]" aria-hidden />
      <main id="content" className={bare ? "min-h-0" : "pb-24 md:pb-0"}>
        {children}
      </main>
      {bare ? null : <SiteFooter />}
      {bare ? null : (
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
      )}
      <TabError quiet>
        <AgentChatLazy />
      </TabError>
      <TabError quiet>
        <DebugDockLazy />
      </TabError>
    </div>
  );
}
