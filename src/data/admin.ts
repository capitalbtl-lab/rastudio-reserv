import { timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest, makeAdminToken } from "./admin-auth";
import {
  ensureLivePrices,
  listPriceRows,
  savePriceRows,
  updateGroupPrice,
  updateOnePrice,
  type PriceRow,
} from "./prices";

function secret() {
  return process.env.ADMIN_PASSWORD?.trim() || "";
}

export const adminLogin = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { password: string })
  .handler(async ({ data }) => {
    const pass = secret();
    if (!pass) return { ok: false as const, error: "Пароль администратора не задан на сервере." };
    const a = Buffer.from(data.password || "");
    const b = Buffer.from(pass);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false as const, error: "Неверный пароль." };
    }
    return { ok: true as const, token: makeAdminToken() };
  });

export const adminPrices = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    ensureLivePrices();
    return { ok: true as const, rows: listPriceRows() };
  });

export const adminSavePrice = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; path: string; all?: number; kbm?: number; tmx?: number })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    return updateOnePrice(data.path, { all: data.all, kbm: data.kbm, tmx: data.tmx });
  });

export const adminSaveGroup = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        direction?: string;
        query?: string;
        field: "all" | "kbm" | "tmx" | "all-three";
        set?: number;
        delta?: number;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    return updateGroupPrice({
      direction: data.direction,
      query: data.query,
      field: data.field,
      set: data.set,
      delta: data.delta,
    });
  });

export const adminSaveAll = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; rows: PriceRow[] })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    return { ok: true as const, rows: savePriceRows(data.rows || []) };
  });
