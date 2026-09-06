import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));

describe("импорт лидов не валит кабинет", () => {
  it("bulk пишет диск порциями, не на каждую карточку", () => {
    const src = readFileSync(join(dir, "dossiers.ts"), "utf8");
    const at = src.indexOf("export async function syncAllFromCrm");
    const next = src.indexOf("export async function syncNewLeadsFromCrm");
    const chunk = src.slice(at, next > at ? next : at + 9000);
    assert.match(chunk, /const BULK|BULK/);
    assert.match(chunk, /persist: false|BULK/);
    assert.match(chunk, /applyCrmCustomer\(item, branch, study === 2, teacherMap, BULK\)/);
    assert.match(chunk, /if \(n && n % 50 === 0\) saveStore/);
    assert.match(chunk, /await yieldLoop/);
    assert.match(chunk, /if \(leadsOnly\)/);
    assert.equal(/overlayMembershipFromCrm/.test(chunk.slice(chunk.indexOf("if (leadsOnly)"))), false);
  });

  it("upsert без persist не вызывает saveStore", () => {
    const src = readFileSync(join(dir, "dossiers.ts"), "utf8");
    const at = src.indexOf("export function upsertDossier");
    const next = src.indexOf("export function dossierFromNote");
    const chunk = src.slice(at, next > at ? next : at + 6000);
    assert.match(chunk, /if \(patch\.persist === false\) return next/);
    assert.match(chunk, /if \(!patch\.quiet && \(before !== after \|\| patch\.note\)\)/);
  });

  it("статус импорта живёт на диске после рестарта", () => {
    const src = readFileSync(join(dir, "admin-disk-run.ts"), "utf8");
    assert.match(src, /crm-pull-job\.json/);
    assert.match(src, /Импорт прервался/);
    assert.match(src, /persistJobFile/);
  });

  it("окно импорта не показывает HTML 502", () => {
    const pull = readFileSync(join(dir, "../lib/crm-pull.ts"), "utf8");
    assert.match(pull, /tidyHttpError/);
    assert.match(pull, /isTransientHttp/);
    assert.match(pull, /Кабинет отвечает медленно/);
  });
});
