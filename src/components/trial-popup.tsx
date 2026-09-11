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

  if (!open) return null;
  const src = trialUrlFor(signup, branchId);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-header/55 p-3 backdrop-blur-[6px] sm:p-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative flex h-[min(40rem,92dvh)] w-full max-w-[32rem] flex-col overflow-hidden rounded-[1.75rem] bg-surface shadow-[var(--shadow-border-hover)]"
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
        <div className="shrink-0 px-6 pb-3 pt-6 sm:px-8 sm:pt-7">
          <p className="kicker text-primary">Студия «Развивайся»</p>
          <h2 className="display mt-2 pr-10 text-[1.7rem] sm:text-[1.9rem]">Запись на пробное</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Первое занятие без абонемента. Если удобнее голосом —{" "}
            <a className="font-semibold text-fg" href={SITE.phoneHref}>
              {SITE.phone}
            </a>
            .
          </p>
        </div>
        <div className="min-h-0 min-w-0 flex-1 px-5 pb-5 sm:px-8 sm:pb-7">
          <TrialEmbed src={src} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
