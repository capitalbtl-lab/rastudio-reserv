const REVEAL = ".course-reveal:not(.is-in)";
const MARQUEE = ".marquee";
const INK = ".ink";

const revealOptions: IntersectionObserverInit = {
  root: null,
  rootMargin: "0px 0px -8% 0px",
  threshold: 0.12,
};

const playOptions: IntersectionObserverInit = {
  root: null,
  threshold: 0,
};

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function bindIntersection(root: ParentNode): () => void {
  const reveals = root.querySelectorAll(".course-reveal");

  if (typeof IntersectionObserver === "undefined" || reducedMotion()) {
    reveals.forEach((el) => el.classList.add("is-in"));
    return () => undefined;
  }

  const reveal = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      observer.unobserve(entry.target);
    }
  }, revealOptions);

  const play = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target;
      if (target.classList.contains("marquee")) {
        target.querySelector(".marquee-track")?.classList.toggle("is-running", entry.isIntersecting);
        continue;
      }
      target.classList.toggle("is-lit", entry.isIntersecting);
    }
  }, playOptions);

  const watch = () => {
    root.querySelectorAll(REVEAL).forEach((el) => reveal.observe(el));
    root.querySelectorAll(MARQUEE).forEach((el) => play.observe(el));
    root.querySelectorAll(INK).forEach((el) => play.observe(el));
  };

  watch();

  let frame = 0;
  const host = root instanceof Document ? root.body : (root as Element);
  const mutations = new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      watch();
    });
  });
  mutations.observe(host, { childList: true, subtree: true });

  const onVisibility = () => {
    host.classList.toggle("is-page-hidden", document.hidden);
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    reveal.disconnect();
    play.disconnect();
    mutations.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    if (frame) cancelAnimationFrame(frame);
  };
}
