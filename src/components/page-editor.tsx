"use client";

import { useEffect, useState } from "react";
import { EditorUnlock } from "@/components/editor-entry";
import { HomeEditorChrome, HomeEditorProvider } from "@/components/home-editor";

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
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if ((location.pathname || "/") === "/") return;
    const door = /(?:\?|&)edit=1(?:&|$)/.test(location.search);
    if (editToken()) {
      setOn(true);
      return;
    }
    if (door) setAsk(true);
  }, []);
  if (on) {
    return (
      <HomeEditorProvider>
        <HomeEditorChrome />
      </HomeEditorProvider>
    );
  }
  if (!ask) return null;
  return (
    <EditorUnlock
      onIn={() => {
        setAsk(false);
        setOn(true);
      }}
      onCancel={() => {
        location.href = location.pathname || "/";
      }}
    />
  );
}
