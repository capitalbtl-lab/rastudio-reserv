import { createServerFn } from "@tanstack/react-start";
import { tokenOk } from "./admin-auth";
import { addInstance, copyInstanceTo, homeToLayout, layoutToHome, phoneIssues } from "./page-layout-core.ts";
import { listEditorPages, loadPageDoc, publishPage, savePageDraft, unpublishPage, applyTypeFrom, findPrototype } from "./page-layout.ts";
import { normalizeHomeLayout } from "./home-layout-core.ts";

function guard(token?: string) {
  return tokenOk(token);
}

export const listEditorPagesFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!guard(data.token)) return { ok: false as const, error: "Нужен вход в редактор." };
    return { ok: true as const, pages: listEditorPages() };
  });

export const loadPageDocFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; path?: string; which?: "draft" | "published" })
  .handler(async ({ data }) => {
    if (!guard(data.token)) return { ok: false as const, error: "Нужен вход в редактор." };
    const path = String(data.path || "/");
    const doc = loadPageDoc(path);
    const which = data.which === "published" ? "published" : "draft";
    const layout = layoutToHome(doc[which]);
    return {
      ok: true as const,
      layout,
      path: doc.path,
      title: doc.title,
      kind: doc.kind,
      dirty: which === "draft",
      differ: JSON.stringify(doc.draft) !== JSON.stringify(doc.published),
      phoneIssues: phoneIssues(doc.draft),
      pages: listEditorPages(),
    };
  });

export const savePageDraftFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; path?: string; layout?: unknown; pageDraft?: unknown })
  .handler(async ({ data }) => {
    if (!guard(data.token)) return { ok: false as const, error: "Нужен вход в редактор." };
    const path = String(data.path || "/");
    const cur = loadPageDoc(path);
    const fillHome = path === "/" || path === "";
    const draft = data.pageDraft || homeToLayout(normalizeHomeLayout(data.layout, fillHome));
    const saved = savePageDraft(path, draft);
    return {
      ok: true as const,
      layout: layoutToHome(saved.draft),
      differ: JSON.stringify(saved.draft) !== JSON.stringify(cur.published),
      phoneIssues: phoneIssues(saved.draft),
    };
  });

export const publishPageFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; path?: string; layout?: unknown; pageDraft?: unknown })
  .handler(async ({ data }) => {
    if (!guard(data.token)) return { ok: false as const, error: "Нужен вход в редактор." };
    const path = String(data.path || "/");
    if (data.pageDraft) savePageDraft(path, data.pageDraft);
    else if (data.layout) savePageDraft(path, homeToLayout(normalizeHomeLayout(data.layout, path === "/" || path === "")));
    const issues = phoneIssues(loadPageDoc(path).draft);
    if (issues.length) return { ok: false as const, error: `На телефоне едет: ${issues[0]}`, phoneIssues: issues };
    const saved = publishPage(path);
    return { ok: true as const, layout: layoutToHome(saved.published), phoneIssues: [] as string[] };
  });

export const revertPublishFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; path?: string })
  .handler(async ({ data }) => {
    if (!guard(data.token)) return { ok: false as const, error: "Нужен вход в редактор." };
    const saved = unpublishPage(String(data.path || "/"));
    return { ok: true as const, layout: layoutToHome(saved.published) };
  });

export const placeBlockFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; path?: string; typeId?: string; fromPath?: string; fromId?: string; before?: string; seed?: "empty" | "template" })
  .handler(async ({ data }) => {
    if (!guard(data.token)) return { ok: false as const, error: "Нужен вход в редактор." };
    const path = String(data.path || "/");
    const doc = loadPageDoc(path);
    let draft = doc.draft;
    if (data.fromPath && data.fromId) {
      const src = loadPageDoc(String(data.fromPath));
      const inst = src.draft.blocks[String(data.fromId)];
      if (!inst) return { ok: false as const, error: "Блока нет на исходной странице." };
      draft = copyInstanceTo(draft, inst, data.before);
    } else {
      const typeId = String(data.typeId || "custom");
      if (data.seed === "template") {
        const proto = findPrototype(typeId);
        draft = proto ? copyInstanceTo(draft, proto, data.before) : addInstance(draft, typeId, data.before);
      } else {
        draft = addInstance(draft, typeId, data.before);
      }
    }
    const saved = savePageDraft(path, draft);
    return { ok: true as const, layout: layoutToHome(saved.draft) };
  });

export const applyTypePatchFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; path?: string; blockId?: string; layout?: unknown })
  .handler(async ({ data }) => {
    if (!guard(data.token)) return { ok: false as const, error: "Нужен вход в редактор." };
    const path = String(data.path || "/");
    const blockId = String(data.blockId || "");
    if (!blockId) return { ok: false as const, error: "Не выбран блок." };
    if (data.layout) savePageDraft(path, homeToLayout(normalizeHomeLayout(data.layout, path === "/" || path === "")));
    const res = applyTypeFrom(path, blockId);
    if (!res.typeId) return { ok: false as const, error: "Блока нет на странице." };
    return { ok: true as const, ...res };
  });
