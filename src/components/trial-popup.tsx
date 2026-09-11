"use client";

import { useEffect, useState } from "react";
import { TrialEmbed } from "@/components/trial-embed";
import { loadPublicTrialSignup } from "@/data/site-signup-fn";
import { SITE_SIGNUP_DEFAULT, isTrialHref, trialUrlFor, type SiteSignup } from "@/data/site-signup-core";

export function TrialPopup() {
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(2);
  const [signup, setSignup] = useState<SiteSignup>(SITE_SIGNUP_DEFAULT);

  useEffect(() => {
    void loadPublicTrialSignup()
      .then((s) => {
        if (s?.trialByBranch) setSignup({ ...SITE_SIGNUP_DEFAULT, ...s });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function show(branch?: number) {
      if (signup.trialOn === false) return;
      setBranchId(Number(branch) || 2);
      setOpen(true);
    }
    function onEvt(e: Event) {
      show(Number((e as CustomEvent).detail?.branchId) || 2);
    }
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!isTrialHref(href)) return;
      e.preventDefault();
      e.stopPropagation();
      show(2);
    }
    function onHash() {
      if (window.location.hash === "#trial") show(2);
    }
    window.addEventListener("ra-open-trial", onEvt as EventListener);
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", onHash);
    if (window.location.hash === "#trial") show(2);
    return () => {
      window.removeEventListener("ra-open-trial", onEvt as EventListener);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", onHash);
    };
  }, [signup.trialOn]);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [open]);

  if (!open) return null;
  const src = trialUrlFor(signup, branchId);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden overscroll-none bg-header/55 p-3 backdrop-blur-[6px]"
      onClick={() => setOpen(false)}
      onWheel={(e) => e.preventDefault()}
    >
      <div
        className="relative h-[min(42rem,90svh)] w-full max-w-[26rem] overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-border-hover)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => setOpen(false)}
          className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-white/90 text-lg leading-none text-muted shadow hover:text-fg"
        >
          ×
        </button>
        <TrialEmbed src={src} className="h-full w-full" />
      </div>
    </div>
  );
}
