import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { ensureLivePrices, listPriceRows, savePriceRows, type PriceRow } from "./prices";

export type CorpRule = { mode: "add" | "percent"; value: number };
export type CorpClient = { id: string; name: string; mode: "add" | "percent"; value: number };
export type CorpFormulas = { kbm: CorpRule; tmx: CorpRule; extra: CorpClient[] };

const DEFAULT: CorpFormulas = {
  kbm: { mode: "percent", value: 100 },
  tmx: { mode: "percent", value: 100 },
  extra: [],
};

function fileOf() {
  return join(process.cwd(), "storage", "price-formulas.json");
}

export function loadFormulas(): CorpFormulas {
  try {
    if (!existsSync(fileOf())) return emptyFormulas();
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<CorpFormulas>;
    return {
      kbm: cleanRule(raw.kbm),
      tmx: cleanRule(raw.tmx),
      extra: cleanExtra(raw.extra),
    };
  } catch {
    return emptyFormulas();
  }
}

function emptyFormulas(): CorpFormulas {
  return { kbm: { ...DEFAULT.kbm }, tmx: { ...DEFAULT.tmx }, extra: [] };
}

function cleanRule(raw?: Partial<CorpRule>): CorpRule {
  return {
    mode: raw?.mode === "add" ? "add" : "percent",
    value: Number.isFinite(Number(raw?.value)) ? Number(raw?.value) : raw?.mode === "add" ? 0 : 100,
  };
}

function cleanExtra(raw?: CorpClient[]) {
  if (!Array.isArray(raw)) return [] as CorpClient[];
  const used = new Set<string>(["all", "kbm", "tmx"]);
  const out: CorpClient[] = [];
  for (const item of raw) {
    const name = String(item?.name || "").trim().slice(0, 40);
    if (!name) continue;
    let id = String(item?.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    if (!id || used.has(id)) id = newId(used);
    used.add(id);
    out.push({ id, name, ...cleanRule(item) });
  }
  return out;
}

function newId(used: Set<string>) {
  let id = "";
  do id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  while (used.has(id));
  return id;
}

export function applyRule(base: number, rule: CorpRule) {
  if (rule.mode === "percent") return Math.max(0, Math.round(base * (Number(rule.value) / 100)));
  return Math.max(0, Math.round(base + Number(rule.value)));
}

export function applyCorpToRow(row: PriceRow, formulas: CorpFormulas): PriceRow {
  const extra: Record<string, number> = { ...(row.extra || {}) };
  for (const c of formulas.extra || []) extra[c.id] = applyRule(row.all, c);
  return {
    ...row,
    kbm: applyRule(row.all, formulas.kbm),
    tmx: applyRule(row.all, formulas.tmx),
    extra,
  };
}

function saveFormulas(formulas: CorpFormulas) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(formulas, null, 2), "utf8");
  return formulas;
}

function pack(raw?: Partial<CorpFormulas>): CorpFormulas {
  return {
    kbm: cleanRule(raw?.kbm),
    tmx: cleanRule(raw?.tmx),
    extra: cleanExtra(raw?.extra),
  };
}

export const adminPriceFormulas = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "get" | "save" | "apply" | "crmStub" | "add" | "remove";
        formulas?: CorpFormulas;
        direction?: string;
        name?: string;
        id?: string;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    if (data.action === "crmStub") {
      return {
        ok: false as const,
        error:
          "Абонементы в AlfaCRM ещё не выложены. Когда появятся в разделе «Абонементы» — нажмите снова, цены подтянутся из tariff/index и лягут в колонку «Все». КБМ, ТМХ и остальные клиенты посчитаются по формуле.",
      };
    }
    if (data.action === "get") return { ok: true as const, formulas: loadFormulas() };

    if (data.action === "add") {
      const name = String(data.name || "").trim().slice(0, 40);
      if (name.length < 2) return { ok: false as const, error: "Напишите название клиента — минимум 2 символа." };
      const formulas = loadFormulas();
      if (formulas.extra.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        return { ok: false as const, error: `Клиент «${name}» уже есть.` };
      }
      const used = new Set(["all", "kbm", "tmx", ...formulas.extra.map((c) => c.id)]);
      const client: CorpClient = { id: newId(used), name, mode: "percent", value: 100 };
      formulas.extra.push(client);
      saveFormulas(formulas);
      ensureLivePrices();
      const rows = listPriceRows().map((r) => ({
        ...r,
        extra: { ...(r.extra || {}), [client.id]: applyRule(r.all, client) },
      }));
      savePriceRows(rows);
      logAdmin(`Корп. клиент: ${name}`);
      return { ok: true as const, formulas, rows };
    }

    if (data.action === "remove") {
      const id = String(data.id || "");
      const formulas = loadFormulas();
      const hit = formulas.extra.find((c) => c.id === id);
      if (!hit) return { ok: false as const, error: "Клиент не найден." };
      formulas.extra = formulas.extra.filter((c) => c.id !== id);
      saveFormulas(formulas);
      ensureLivePrices();
      const rows = listPriceRows().map((r) => {
        const extra = { ...(r.extra || {}) };
        delete extra[id];
        return { ...r, extra };
      });
      savePriceRows(rows);
      logAdmin(`Удалён корп. клиент: ${hit.name}`);
      return { ok: true as const, formulas, rows };
    }

    const formulas = pack(data.formulas);
    saveFormulas(formulas);
    if (data.action === "save") {
      logAdmin("Формулы корпоративных клиентов сохранены");
      return { ok: true as const, formulas };
    }
    ensureLivePrices();
    const dir = (data.direction || "").toLowerCase().trim();
    const rows = listPriceRows().map((r) => {
      if (dir && r.direction.toLowerCase() !== dir && !r.direction.toLowerCase().includes(dir)) return r;
      return applyCorpToRow(r, formulas);
    });
    savePriceRows(rows);
    logAdmin(`Корп. цены пересчитаны от колонки «Все»${dir ? ` · ${data.direction}` : ""}`);
    return { ok: true as const, formulas, rows };
  });
