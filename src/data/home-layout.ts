import { emptyHomeLayout, normalizeHomeLayout, type HomeLayoutDoc } from "./home-layout-core.ts";
import { emptyOrFile } from "./home-layout-file.ts";
import { draftHomeLayout, loadPageDoc, publishedHomeLayout, savePageDraft } from "./page-layout.ts";
import { applyHomeToPage, layoutToHome } from "./page-layout-core.ts";

export function loadHomeLayout(): HomeLayoutDoc {
  try {
    return publishedHomeLayout();
  } catch {
    return emptyOrFile();
  }
}

export function loadHomeDraft(): HomeLayoutDoc {
  try {
    return draftHomeLayout();
  } catch {
    return loadHomeLayout();
  }
}

/** Пишет черновик главной. Гость читает published. */
export function saveHomeLayout(raw: unknown): HomeLayoutDoc {
  const next = normalizeHomeLayout(raw);
  const page = applyHomeToPage(loadPageDoc("/"), next);
  return layoutToHome(savePageDraft("/", page.draft).draft);
}

export function resetHomeLayout(): HomeLayoutDoc {
  return saveHomeLayout(emptyHomeLayout());
}
