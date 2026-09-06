"use client";

import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { SITE } from "@/data/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { bindIntersection } from "@/lib/intersection";
import { organizationJsonLd } from "@/data/seo";
import { JsonLd } from "@/components/json-ld";
import { AgentChat } from "@/components/agent-chat";
import { tickBehavior } from "@/data/page-behavior";

function DebugDockLazy() {
  const [Dock, setDock] = useState<ComponentType<{ startAsk?: boolean }> | null>(null);
  const [startAsk, setStartAsk] = useState(false);
  useEffect(() => {
    const load = (ask?: boolean) => {
      if (ask) setStartAsk(true);
      void import("@/components/debug-dock").then((m) => setDock(() => m.DebugDock));
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