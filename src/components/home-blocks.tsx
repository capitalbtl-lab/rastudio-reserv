"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { HomeReadProvider } from "@/components/home-read";
import { wantsEdit } from "@/components/home-edit-boot";
import { HomePublicInner } from "@/components/home-public";
import type { HomeLayoutDoc } from "@/data/home-layout-core";

export { HomeSlot, BlockMedia } from "@/components/home-public";
export type { HomeLayoutDoc };

export function HomeCanvas({
  initialOrder,
  layout,
  children,
}: {
  initialOrder?: unknown;
  layout?: unknown;
  children: ReactNode;
}) {
  const initial = layout || initialOrder;
  const [Session, setSession] = useState<ComponentType<{ initial?: unknown; children: ReactNode }> | null>(null);

  useEffect(() => {
    const boot = () => {
      if (!wantsEdit()) {
        setSession(null);
        return;
      }
      void import("@/components/home-editor").then((m) => setSession(() => m.HomeEditorSession));
    };
    boot();
    window.addEventListener("ra-debug-session", boot);
    return () => window.removeEventListener("ra-debug-session", boot);
  }, []);

  if (Session) return <Session initial={initial}>{children}</Session>;
  return (
    <HomeReadProvider initial={initial}>
      <HomePublicInner>{children}</HomePublicInner>
    </HomeReadProvider>
  );
}
