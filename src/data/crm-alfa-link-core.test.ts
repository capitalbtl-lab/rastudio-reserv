import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alfaLinked, alfaLinkOf, ALFA_LINK_MODES } from "./crm-alfa-link-core.ts";

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
  });

  it("очередь и fresh не стучатся в Alfa в режиме offline", () => {
    const exp = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    const tickAt = exp.indexOf("export async function tickExportQueue");
    const chunk = exp.slice(tickAt, tickAt + 900);
    assert.match(chunk, /alfaLinkedNow/);
    assert.match(chunk, /без Alfa/);
    assert.equal(chunk.indexOf("await import(\"./alfacrm\")") > chunk.indexOf("if (!alfaLinkedNow())"), true);
    const pack = readFileSync(new URL("./crm-packet-queue.ts", import.meta.url), "utf8");
    assert.match(pack, /if \(!alfaLinkedNow\(\)\) return crmQueueSnapshot/);
    assert.match(pack, /extra: "без Alfa"/);
    const sched = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(sched, /wantAlfaPull\(data.fresh\)/);
    assert.match(sched, /alfaLinkSave/);
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /Связь с AlfaCRM/);
    assert.match(ui, /ALFA_LINK_MODES/);
  });
});
