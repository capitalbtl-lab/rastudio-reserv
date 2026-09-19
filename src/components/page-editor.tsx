"use client";

import { useEffect, useState } from "react";
import { HomeEditorChrome, HomeEditorProvider } from "@/components/home-editor";

function staffToken() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* */
  }
  try {
    return localStorage.getItem("ra_admin") || sessionStorage.getItem("ra_edit") || "";
  } catch {
    return "";
  }
}

function wantsEdit() {
  try {
    if (sessionStorage.getItem("ra_edit")) return true;
  } catch {
    /* */
  }
  try {
    if (!/(?:\?|&)edit=1(?:&|$)/.test(location.search)) return false;
    const t = staffToken();
    if (!t) return false;
    sessionStorage.setItem("ra_edit", t);
    return true;
  } catch {
    return false;
  }
}

/** Редактор на школе/курсе. Главная уже в HomeCanvas. */
export function PageEditorBoot() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if ((location.pathname || "/") === "/") return;
    if (!wantsEdit()) return;
    setOn(true);
  }, []);
  if (!on) return null;
  return (
    <HomeEditorProvider>
      <HomeEditorChrome />
    </HomeEditorProvider>
  );
}
