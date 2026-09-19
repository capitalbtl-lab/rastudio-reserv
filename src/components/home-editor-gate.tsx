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

function wantsPreview() {
  try {
    return /(?:\?|&)preview=1(?:&|$)/.test(location.search) && Boolean(staffToken() || sessionStorage.getItem("ra_debug"));
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
  const [preview, setPreview] = useState<unknown>(null);
  useEffect(() => {
    const boot = () => {
      if (wantsPreview()) {
        setProv(null);
        const token = staffToken() || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("ra_debug") : "") || "";
        void import("@/data/page-layout-fn").then(({ loadPageDocFn }) =>
          loadPageDocFn({ data: { token, path: location.pathname || "/", which: "draft" } }).then((res) => {
            if (res.ok && "layout" in res) setPreview(res.layout);
          }),
        );
        return;
      }
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
  if (preview) return <HomeReadProvider initial={preview}>{children}</HomeReadProvider>;
  if (!Prov) return <HomeReadProvider initial={initial}>{children}</HomeReadProvider>;
  return <Prov initial={initial}>{children}</Prov>;
}
