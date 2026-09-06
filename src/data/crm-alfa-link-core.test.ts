import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  alfaLinked,
  alfaLinkOf,
  alfaSyncOf,
  exportOpPushChannel,
  ALFA_LINK_MODES,
  ALFA_PULL_CH,
  ALFA_PUSH_CH,
} from "./crm-alfa-link-core.ts";

describe("связь с AlfaCRM", () => {
  it("по умолчанию linked, offline только явно", () => {
    assert.equal(alfaLinked(), true);
    assert.equal(alfaLinked("linked"), true);
    assert.equal(alfaLinked("offline"), false);
    assert.equal(alfaLinkOf("offline"), "offline");
    assert.equal(alfaLinkOf(""), "linked");
    assert.deepEqual(
      ALFA_LINK_MODES.map((m) => m.id),
      ["linked", "offline"],
    );
    assert.equal(alfaSyncOf(null).pull.leads, true);
    assert.equal(alfaSyncOf({ pull: { leads: false } }).pull.leads, false);
    assert.equal(alfaSyncOf({ pull: { leads: false } }).push.trials, true);
    assert.equal(exportOpPushChannel("customer.create", { is_study: 0 }), "trials");
    assert.equal(exportOpPushChannel("customer.create", { lesson: { type: "trial" } }), "trials");
    assert.equal(exportOpPushChannel("lesson.create", {}), "lessons");
    assert.equal(exportOpPushChannel("lead-status.update", {}), "leads");
    assert.equal(ALFA_PULL_CH.length, 3);
    assert.equal(ALFA_PUSH_CH.length, 7);
  });

  it("очередь и fresh не стучатся в Alfa в режиме offline", () => {
    const exp = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    const tickAt = exp.indexOf("export async function tickExportQueue");
    const chunk = exp.slice(tickAt, tickAt + 1400);
    assert.match(chunk, /alfaLinkedNow/);
    assert.match(chunk, /wantAlfaPush/);
    assert.match(chunk, /без Alfa/);
    assert.equal(chunk.indexOf("await import(\"./alfacrm\")") > chunk.indexOf("if (!alfaLinkedNow())"), true);
    const pack = readFileSync(new URL("./crm-packet-queue.ts", import.meta.url), "utf8");
    assert.match(pack, /if \(!alfaLinkedNow\(\)\)/);
    assert.match(pack, /wantAlfaPullChannel\("clients"\)/);
    assert.match(pack, /extra: "без Alfa"/);
    const sched = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(sched, /wantAlfaPull\(data.fresh\)/);
    assert.match(sched, /alfaLinkSave/);
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /Фон с AlfaCRM/);
    assert.match(ui, /ALFA_PUSH_CH/);
    assert.match(ui, /ALFA_PULL_CH/);
    const link = readFileSync(new URL("./crm-alfa-link.ts", import.meta.url), "utf8");
    assert.match(link, /wantAlfaDelta/);
    assert.match(link, /wantAlfaPush/);
    assert.match(link, /pull.leads/);
  });
});
