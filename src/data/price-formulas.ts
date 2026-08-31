import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { ensureLivePrices, listPriceRows, savePriceRows } from "./prices";

export type CorpRule = { mode: "add" | "percent"; value: number };
export type CorpFormulas = { kbm: CorpRule; tmx: CorpRule };

const DEFAULT: CorpFormulas = {
  kbm: { mode: "percent", value: 100 },
  tmx: { mode: "percent", value: 100 },
};

function fileOf() {
  return join(process.cwd(), "storage", "price-formulas.json");
}

export function loadFormulas(): CorpFormulas {
  try {
    if (!existsSync(fileOf())) return { ...DEFAULT, kbm: { ...DEFAULT.kbm }, tmx: { ...DEFAULT.tmx } };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<CorpFormulas>;
    return {
      kbm: cleanRule(raw.kbm),
      tmx: cleanRule(raw.tmx),
    };
  } catch {
    return { ...DEFAULT, kbm: { ...DEFAULT.kbm }, tmx: { ...DEFAULT.tmx } };
  }
}

function cleanRule(raw?: Partial<CorpRule>): CorpRule {
  return {
    mode: raw?.mode === "add" ? "add" : "percent",
    value: Number.isFinite(Number(raw?.value)) ? Number(raw?.value) : raw?.mode === "add" ? 0 : 100,
  };
}

export function applyRule(base: number, rule: CorpRule) {
  if (rule.mode === "percent") return Math.max(0, Math.round(base * (Number(rule.value) / 100)));
  return Math.max(0, Math.round(base + Number(rule.value)));
}

export const adminPriceFormulas = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "get" | "save" | "apply" | "crmStub";
        formulas?: CorpFormulas;
        direction?: string;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    if (data.action === "crmStub") {
      return {
        ok: false as const,
        error:
          "Абонементы в AlfaCRM ещё не выложены. Когда появятся в разделе «Абонементы» — нажмите снова, цены подтянутся из tariff/index и лягут в колонку «Все». КБМ и ТМХ посчитаются по формуле.",
      };
    }
    if (data.action === "get") return { ok: true as const, formulas: loadFormulas() };
    const formulas: CorpFormulas = {
      kbm: cleanRule(data.formulas?.kbm),
      tmx: cleanRule(data.formulas?.tmx),
    };
    mkdirSync(dirname(fileOf()), { recursive: true });
    writeFileSync(fileOf(), JSON.stringify(formulas, null, 2), "utf8");
    if (data.action === "save") {
      logAdmin("Формула КБМ/ТМХ сохранена");
      return { ok: true as const, formulas };
    }
    ensureLivePrices();
    const dir = (data.direction || "").toLowerCase().trim();
    const rows = listPriceRows().map((r) => {
      if (dir && r.direction.toLowerCase() !== dir && !r.direction.toLowerCase().includes(dir)) return r;
      return { ...r, kbm: applyRule(r.all, formulas.kbm), tmx: applyRule(r.all, formulas.tmx) };
    });
    savePriceRows(rows);
    logAdmin(`КБМ/ТМХ пересчитаны от колонки «Все»${dir ? ` · ${data.direction}` : ""}`);
    return { ok: true as const, formulas, rows };
  });
