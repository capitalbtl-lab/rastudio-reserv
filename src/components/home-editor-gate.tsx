"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { HomeReadProvider } from "@/components/home-read";

type Prov = ComponentType<{ initial?: unknown; children: ReactNode }>;

function staffToken() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* */
  }
  try {
    return localStorage.getItem("ra_admin") || "";
  } catch {
    return "";
  }
}

function wantsEdit() {
  try {
    if (sessionStorage.getItem("ra_debug")) return true;
  } catch {
    /* */
  }
  try {
    if (!/(?:\?|&)edit=1(?:&|$)/.test(location.search)) return false;
    const t = staffToken();
    if (!t) return false;
    sessionStorage.setItem("ra_debug", t);
    return true;
  } catch {
    return false;
  }
}

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
