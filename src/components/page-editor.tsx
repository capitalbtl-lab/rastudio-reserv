"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { HomeEditorChrome, HomeEditorProvider } from "@/components/home-editor";

type Unlock = ComponentType<{ onIn?: () => void; onCancel?: () => void }>;

function editToken() {
  try {
    return sessionStorage.getItem("ra_edit") || "";
  } catch {
    return "";
  }
}

/** Редактор на школе/курсе. Главная уже в HomeCanvas. */
export function PageEditorBoot({ children }: { children?: ReactNode }) {
  const [on, setOn] = useState(false);
  const [Unlock, setUnlock] = useState<Unlock | null>(null);
  useEffect(() => {
    if ((location.pathname || "/") === "/") return;
    if (editToken()) {
      setOn(true);
      return;
    }
    if (/(?:\?|&)edit=1(?:&|$)/.test(location.search)) {
      void import("@/components/editor-unlock").then((m) => setUnlock(() => m.EditorUnlock));
    }
  }, []);
  if (on) {
    return (
      <HomeEditorProvider>
        <HomeEditorChrome />
        {children}
      </HomeEditorProvider>
    );
  }
  return (
    <>
      {children}
      {Unlock ? (
        <Unlock
          onIn={() => {
            setUnlock(null);
            setOn(true);
          }}
          onCancel={() => {
            location.href = location.pathname || "/";
          }}
        />
      ) : null}
    </>
  );
}
