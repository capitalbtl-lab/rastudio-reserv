import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./crm-tariffs.ts", import.meta.url), "utf8");

describe("экспорт абонемента в Alfa", () => {
  it("создание не стопорится без входа в кабинет", () => {
    const push = src.slice(src.indexOf("export async function pushTariffsToCrm"), src.indexOf("function blankTariff"));
    assert.doesNotMatch(push, /if \(!login\.cookie\) return/);
    assert.match(push, /let cookie = login\.cookie \|\| ""/);
    assert.match(src, /async function pushTariffViaApi/);
    assert.match(src, /tariff\/update\?id=\$\{t\.id\}/);
    assert.match(src, /branch_ids: t\.branchIds/);
    assert.match(src, /subject_ids: t\.subjectIds/);
  });

  it("после API-create кабинет не валит карточку", () => {
    const create = src.slice(src.indexOf("export async function createTariffInCrm"), src.indexOf("async function findActiveTariffIdByName"));
    assert.match(create, /await pushTariffViaApi\(full\)/);
    assert.match(create, /ok: true as const, id, tariff: full/);
    assert.doesNotMatch(create, /предмет и типы уроков не записались/);
  });

  it("без cookie — v2api, не отказ", () => {
    const fn = src.slice(src.indexOf("export async function pushTariffToCrm"), src.indexOf("export async function pushTariffsToCrm"));
    assert.match(fn, /await pushTariffViaApi\(t\)/);
    assert.doesNotMatch(fn, /Предметы и типы уроков без входа не записываются/);
  });
});
