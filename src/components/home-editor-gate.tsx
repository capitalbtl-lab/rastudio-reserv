"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { HomeReadProvider } from "@/components/home-read";
import { wantsEdit } from "@/components/home-edit-boot";

export { wantsEdit, staffToken } from "@/components/home-edit-boot";

type Prov = ComponentType<{ initial?: unknown; children: ReactNode }>;

export function HomeEditorGate({
  initial,
  children,
}: {
  initial?: unknown;
  children: ReactNode;
}) {
  const [Prov, setProv] = useState<Prov | null>(null);
  useEffect(() => {
    const boot = () => {
      if (!wantsEdit()) {
        setProv(null);
        return;
      }
      void import("@/components/home-editor").then((m) => setProv(() => m.HomeEditorProvider));
    };
    boot();
    window.addEventListener("ra-debug-session", boot);
    return () => window.removeEventListener("ra-debug-session", boot);
  }, []);
  if (!Prov) return <HomeReadProvider initial={initial}>{children}</HomeReadProvider>;
  return <Prov initial={initial}>{children}</Prov>;
}
