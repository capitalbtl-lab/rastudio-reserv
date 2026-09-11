"use client";

import { useEffect, useState } from "react";
import { SITE } from "@/data/site";
import { TrialEmbed } from "@/components/trial-embed";
import { loadPublicTrialSignup } from "@/data/site-signup-fn";
import { SITE_SIGNUP_DEFAULT, trialUrlFor, type SiteSignup } from "@/data/site-signup-core";

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
      if (!(href === "#trial" || /#trial$/.test(href) || href.includes("#trial"))) return;
      if (signup.trialOn === false) return;
      e.preventDefault();
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
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden overscroll-none bg-header/55 p-3 backdrop-blur-[6px] sm:p-5"
      onClick={() => setOpen(false)}
      onWheel={(e) => e.preventDefault()}
    >
      <div
        className="relative flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] bg-surface shadow-[var(--shadow-border-hover)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-bg text-xl leading-none text-muted hover:bg-surface-2 hover:text-fg"
        >
          ×
        </button>
        <div className="shrink-0 px-6 pb-2 pt-5 sm:px-7 sm:pt-6">
          <p className="kicker text-primary">Студия «Развивайся»</p>
          <h2 className="display mt-1.5 pr-10 text-[1.55rem] sm:text-[1.75rem]">Запись на пробное</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Первое занятие без абонемента.{" "}
            <a className="font-semibold text-fg" href={SITE.phoneHref}>
              {SITE.phone}
            </a>
          </p>
        </div>
        <div className="h-[22rem] shrink-0 px-5 pb-5 sm:h-[24rem] sm:px-7 sm:pb-6">
          <TrialEmbed src={src} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
