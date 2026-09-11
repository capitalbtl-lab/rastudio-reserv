"use client";

import { useEffect, useState } from "react";
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-2 sm:p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative flex h-[min(44rem,92dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.25rem] bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => setOpen(false)}
          className="absolute right-2.5 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-muted hover:bg-black/5 hover:text-fg"
        >
          ×
        </button>
        <div className="shrink-0 px-4 pb-2 pt-3.5 sm:px-5">
          <p className="kicker pr-8 text-primary">Пробное занятие</p>
          <h2 className="display mt-0.5 pr-8 text-xl sm:text-[1.35rem]">Запись на пробное</h2>
        </div>
        <div className="min-h-0 min-w-0 flex-1 px-2 pb-2 sm:px-3 sm:pb-3">
          <div className="h-full overflow-hidden rounded-[10px] bg-bg">
            <TrialEmbed src={src} className="h-full w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
