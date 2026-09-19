import { createServerFn } from "@tanstack/react-start";
import { extrasOf, stylesOf } from "./page-layout-core.ts";
import { loadPageDoc } from "./page-layout.ts";

/** Публично: опубликованные атомы и стили секций. Не импортировать token/cookie. */
export const publicPageExtrasFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { path?: string })
  .handler(async ({ data }) => {
    const path = String(data.path || "").replace(/\/+$/, "") || "/";
    if (path === "/") return { ok: true as const, extras: [] as ReturnType<typeof extrasOf>, styles: {} as ReturnType<typeof stylesOf> };
    try {
      const pub = loadPageDoc(path).published;
      return { ok: true as const, extras: extrasOf(pub), styles: stylesOf(pub) };
    } catch {
      return { ok: true as const, extras: [], styles: {} };
    }
  });
