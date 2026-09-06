import { createServerFn } from "@tanstack/react-start";
import { tokenOk } from "./admin-auth";
import { loadHomeLayout, saveHomeLayout } from "./home-layout";
import { emptyHomeLayout } from "./home-layout-core";

export const publicHomeLayout = createServerFn({ method: "GET" }).handler(async () => {
  const layout = loadHomeLayout();
  return { ok: true as const, layout, order: layout.order };
});

export const saveHomeLayoutFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; layout?: unknown; order?: unknown; reset?: boolean })
  .handler(async ({ data }) => {
    if (!tokenOk(data.token)) return { ok: false as const, error: "Нужен режим отладки." };
    const layout = saveHomeLayout(data.reset ? emptyHomeLayout() : data.layout || { order: data.order });
    return { ok: true as const, layout, order: layout.order };
  });
