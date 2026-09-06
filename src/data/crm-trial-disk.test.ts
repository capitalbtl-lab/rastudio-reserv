import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldEnsureChudnovaTrial } from "./crm-trial-test-core.ts";

describe("пробное Чудновой на диск", () => {
  it("карточка 670 и ФИО — да, Ольга — нет", () => {
    assert.equal(shouldEnsureChudnovaTrial(670), true);
    assert.equal(shouldEnsureChudnovaTrial(1, "Чуднова Александра Алексеевна"), true);
    assert.equal(shouldEnsureChudnovaTrial(1, "Чуднова Ольга Сергеевна"), false);
    assert.equal(shouldEnsureChudnovaTrial(2, "Иванова"), false);
  });

  it("пробное в Alfa без group_ids, зал перебирается", () => {
    const alfa = readFileSync(new URL("./alfacrm.ts", import.meta.url), "utf8");
    const fnAt = alfa.indexOf("export async function createAlfaLesson");
    const fn = alfa.slice(fnAt, fnAt + 4500);
    assert.match(fn, /allowGroup/);
    assert.match(fn, /type.id === 3/);
    assert.match(fn, /аудитория занята/);
    assert.match(fn, /SEED_ROOMS/);
    const disk = readFileSync(new URL("./crm-trial-disk.ts", import.meta.url), "utf8");
    assert.equal(/group_ids/.test(disk), false);
  });
});
