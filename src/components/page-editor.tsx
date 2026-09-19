"use client";

import { useEffect, useState, type ComponentType } from "react";
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
export function PageEditorBoot() {
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
      </HomeEditorProvider>
    );
  }
  if (!Unlock) return null;
  return (
    <Unlock
      onIn={() => {
        setUnlock(null);
        setOn(true);
      }}
      onCancel={() => {
        location.href = location.pathname || "/";
      }}
    />
  );
}
