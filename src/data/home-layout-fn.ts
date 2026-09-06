import { createServerFn } from "@tanstack/react-start";
import { tokenOk } from "./admin-auth";
import { loadHomeLayout, saveHomeLayout } from "./home-layout";
import { defaultHomeOrder } from "./home-layout-core";

export const publicHomeLayout = createServerFn({ method: "GET" }).handler(async () => {
  return { ok: true as const, order: loadHomeLayout() };
});

export const saveHomeLayoutFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; order?: unknown; reset?: boolean })
  .handler(async ({ data }) => {
    if (!tokenOk(data.token)) return { ok: false as const, error: "Нужен режим отладки." };
    const order = saveHomeLayout(data.reset ? defaultHomeOrder() : data.order);
    return { ok: true as const, order };
  });
