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
import {
  checkPassword,
  listAdminLog,
  loadAdminSettings,
  logAdmin,
  setAdminPassword,
  setCodeword,
} from "./admin-settings";

export const adminLogin = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { password: string })
  .handler(async ({ data }) => {
    loadAdminSettings();
    if (!checkPassword(data.password || "")) {
      return { ok: false as const, error: "Неверный пароль." };
    }
    logAdmin("Вход в кабинет");
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
    const saved = updateOnePrice(data.path, { all: data.all, kbm: data.kbm, tmx: data.tmx });
    if (saved.ok) logAdmin(`Цена: ${saved.row.name} → ${saved.row.all} ₽`);
    return saved;
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
    const saved = updateGroupPrice({
      direction: data.direction,
      query: data.query,
      field: data.field,
      set: data.set,
      delta: data.delta,
    });
    if (saved.ok) logAdmin(`Группа: ${data.direction || data.query} · ${saved.count} курсов`);
    return saved;
  });

export const adminSaveAll = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; rows: PriceRow[] })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    return { ok: true as const, rows: savePriceRows(data.rows || []) };
  });

export const adminMeta = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    loadAdminSettings();
    return { ok: true as const, hasCodeword: true, log: listAdminLog() };
  });

export const adminSetCodeword = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; word: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const saved = setCodeword(data.word || "");
    if (saved.ok) logAdmin("Сменено кодовое слово");
    return saved;
  });

export const adminSetPassword = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; password: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const saved = setAdminPassword(data.password || "");
    if (saved.ok) logAdmin("Сменён пароль кабинета");
    return saved;
  });

export const adminEdits = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const { listPageEdits } = await import("./edits");
    return { ok: true as const, edits: listPageEdits() };
  });

export const adminClearEdit = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; path: string; field: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const { clearPageField } = await import("./edits");
    const saved = clearPageField(data.path, data.field);
    if (saved.ok) logAdmin(`Сброс текста: ${saved.path} · ${saved.field}`);
    return saved;
  });
