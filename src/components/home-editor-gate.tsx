"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { HomeReadProvider } from "@/components/home-read";
import { EditorUnlock } from "@/components/editor-entry";

type Prov = ComponentType<{ initial?: unknown; children: ReactNode }>;

const EDIT_KEY = "ra_edit";

function editToken() {
  try {
    return sessionStorage.getItem(EDIT_KEY) || "";
  } catch {
    return "";
  }
}

function wantsEdit() {
  return Boolean(editToken());
}

function wantsPreview() {
  try {
    return /(?:\?|&)preview=1(?:&|$)/.test(location.search) && Boolean(editToken());
  } catch {
    return false;
  }
}

function wantsUnlock() {
  try {
    return /(?:\?|&)edit=1(?:&|$)/.test(location.search) && !editToken();
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
  const [unlock, setUnlock] = useState(false);
  useEffect(() => {
    const boot = () => {
      if (wantsPreview()) {
        setProv(null);
        setUnlock(false);
        const token = editToken();
        void import("@/data/page-layout-fn").then(({ loadPageDocFn }) =>
          loadPageDocFn({ data: { token, path: location.pathname || "/", which: "draft" } }).then((res) => {
            if (res.ok && "layout" in res) setPreview(res.layout);
          }),
        );
        return;
      }
      if (wantsUnlock()) {
        setUnlock(true);
        setProv(null);
        return;
      }
      if (!wantsEdit()) {
        setUnlock(false);
        setProv(null);
        return;
      }
      setUnlock(false);
      void import("@/components/home-editor").then((m) => setProv(() => m.HomeEditorProvider));
    };
    boot();
    window.addEventListener("ra-edit-session", boot);
    return () => window.removeEventListener("ra-edit-session", boot);
  }, []);
  if (preview) return <HomeReadProvider initial={preview}>{children}</HomeReadProvider>;
  if (unlock) {
    return (
      <HomeReadProvider initial={initial}>
        {children}
        <EditorUnlock
          onIn={() => {
            setUnlock(false);
            window.dispatchEvent(new Event("ra-edit-session"));
          }}
          onCancel={() => {
            location.href = location.pathname || "/";
          }}
        />
      </HomeReadProvider>
    );
  }
  if (!Prov) return <HomeReadProvider initial={initial}>{children}</HomeReadProvider>;
  return <Prov initial={initial}>{children}</Prov>;
}
