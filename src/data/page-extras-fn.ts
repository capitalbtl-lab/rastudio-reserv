import { createServerFn } from "@tanstack/react-start";
import { extrasOf } from "./page-layout-core.ts";
import { loadPageDoc } from "./page-layout.ts";

/** Публично: только опубликованные атомы. Не импортировать token/cookie. */
export const publicPageExtrasFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { path?: string })
  .handler(async ({ data }) => {
    const path = String(data.path || "").replace(/\/+$/, "") || "/";
    if (path === "/") return { ok: true as const, extras: [] as ReturnType<typeof extrasOf> };
    try {
      return { ok: true as const, extras: extrasOf(loadPageDoc(path).published) };
    } catch {
      return { ok: true as const, extras: [] };
    }
  });
