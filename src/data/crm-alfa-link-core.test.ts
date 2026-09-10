import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  alfaLinked,
  alfaLinkOf,
  alfaSyncOf,
  exportOpPushChannel,
  pushAllowed,
  pullAllowed,
  deltaAllowed,
  pullFreshAllowed,
  ALFA_LINK_MODES,
  ALFA_PULL_CH,
  ALFA_PUSH_CH,
  ALFA_SYNC_DEFAULT,
  ALFA_PIPE_CH,
  pipeAllowed,
  payDaysOf,
} from "./crm-alfa-link-core.ts";

const linked = { mode: "linked" as const, ...ALFA_SYNC_DEFAULT };
const offline = { mode: "offline" as const, ...ALFA_SYNC_DEFAULT };

describe("режим фона с AlfaCRM", () => {
  it("по умолчанию linked, все каналы включены", () => {
    assert.equal(alfaLinked(), true);
    assert.equal(alfaLinked("linked"), true);
    assert.equal(alfaLinked("offline"), false);
    assert.equal(alfaLinkOf("offline"), "offline");
    assert.equal(alfaLinkOf(""), "linked");
    assert.deepEqual(
      ALFA_LINK_MODES.map((m) => m.id),
      ["linked", "offline"],
    );
    assert.equal(ALFA_PULL_CH.length, 9);
    assert.equal(ALFA_PUSH_CH.length, 8);
    assert.equal(ALFA_PIPE_CH.length, 5);
    assert.equal(ALFA_SYNC_DEFAULT.pipe.instantPay, true);
    assert.equal(ALFA_SYNC_DEFAULT.pull.leads, true);
    assert.equal(ALFA_SYNC_DEFAULT.pull.pay, true);
    assert.equal(ALFA_SYNC_DEFAULT.pull.teachers, true);
    assert.equal(ALFA_SYNC_DEFAULT.push.trials, true);
    assert.equal(ALFA_SYNC_DEFAULT.push.subjects, true);
    assert.equal(ALFA_SYNC_DEFAULT.pipe.verifyCreate, true);
    assert.equal(ALFA_SYNC_DEFAULT.payDays, 3);
  });

  it("alfaSyncOf мержит только указанные флаги, минуты 2…60", () => {
    const offLeads = alfaSyncOf({ pull: { leads: false } });
    assert.equal(offLeads.pull.leads, false);
    assert.equal(offLeads.pull.clients, true);
    assert.equal(offLeads.push.trials, true);
    const fromCur = alfaSyncOf({ push: { trials: false } }, offLeads);
    assert.equal(fromCur.pull.leads, false);
    assert.equal(fromCur.push.trials, false);
    assert.equal(fromCur.push.lessons, true);
    assert.equal(alfaSyncOf({ minutes: 1 }).minutes, 2);
    assert.equal(alfaSyncOf({ minutes: 99 }).minutes, 60);
    assert.equal(alfaSyncOf({ minutes: 15 }).minutes, 15);
    assert.equal(alfaSyncOf({ payDays: 7 }).payDays, 7);
    assert.equal(alfaSyncOf({ payDays: 99 }).payDays, 14);
    assert.equal(alfaSyncOf({ pipe: { keepToken: false } }).pipe.keepToken, false);
    assert.equal(alfaSyncOf({ pipe: { keepToken: false } }).pipe.retry401, true);
    assert.equal(payDaysOf({ payDays: 3 }), 3);
    assert.equal(pipeAllowed({ pipe: { sharedLimiter: false } }, "sharedLimiter"), false);
    assert.equal(pipeAllowed({}, "verifyCreate"), true);
  });

  it("пробное Ольги — канал trials, занятие trial тоже", () => {
    assert.equal(exportOpPushChannel("customer.create", { is_study: 0 }), "trials");
    assert.equal(exportOpPushChannel("customer.create", { lesson: { type: "trial" } }), "trials");
    assert.equal(exportOpPushChannel("lesson.create", { type: "trial", via: "createAlfaLesson" }), "trials");
    assert.equal(exportOpPushChannel("lesson.create", { lesson_type_id: 3 }), "trials");
    assert.equal(exportOpPushChannel("lesson.create", { type: "regular" }), "lessons");
    assert.equal(exportOpPushChannel("lesson.create", {}), "lessons");
    assert.equal(exportOpPushChannel("cgi.apply", {}), "groups");
    assert.equal(exportOpPushChannel("subject.create", {}), "subjects");
    assert.equal(exportOpPushChannel("customer-tariff.create", {}), "tariffs");
    assert.equal(exportOpPushChannel("pay.create", {}), "pay");
    assert.equal(exportOpPushChannel("pay.delete", {}), "pay");
    assert.equal(exportOpPushChannel("lead-status.update", {}), "leads");
    assert.equal(exportOpPushChannel("customer.update", {}), "clients");
    assert.equal(exportOpPushChannel("customer.create", { is_study: 1 }), "leads");
  });

  it("offline: ни дельта, ни fresh, ни выгрузка", () => {
    assert.equal(deltaAllowed(offline, true), false);
    assert.equal(pullFreshAllowed(offline, true), false);
    assert.equal(pullAllowed(offline, "leads"), false);
    assert.equal(pushAllowed(offline, "customer.create", { is_study: 0 }), false);
    assert.equal(pushAllowed(offline, "lesson.create", { type: "trial" }), false);
  });

  it("linked + выключенные каналы: диск можно, Alfa нет", () => {
    const noTrials = { ...linked, push: { ...linked.push, trials: false } };
    const noLeadsPull = { ...linked, pull: { ...linked.pull, leads: false } };
    assert.equal(pushAllowed(linked, "customer.create", { is_study: 0 }), true);
    assert.equal(pushAllowed(noTrials, "customer.create", { is_study: 0 }), false);
    assert.equal(pushAllowed(noTrials, "lesson.create", { type: "trial" }), false);
    assert.equal(pushAllowed(noTrials, "lesson.create", { type: "regular" }), true);
    assert.equal(pushAllowed(noTrials, "cgi.apply", {}), true);
    assert.equal(deltaAllowed(linked, true), true);
    assert.equal(deltaAllowed(linked, false), false);
    assert.equal(deltaAllowed(noLeadsPull, true), false);
    assert.equal(pullFreshAllowed(noLeadsPull, true), true);
    assert.equal(pullAllowed({ ...linked, pull: { ...linked.pull, clients: false } }, "clients"), false);
    assert.equal(pullAllowed({ ...linked, pull: { ...linked.pull, clients: false } }, "leads"), true);
  });

  it("очередь и кабинет режут Alfa до импорта alfacrm", () => {
    const exp = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    const tickAt = exp.indexOf("export async function tickExportQueue");
    const chunk = exp.slice(tickAt, tickAt + 1600);
    assert.match(chunk, /alfaLinkedNow/);
    assert.match(chunk, /wantAlfaPush/);
    assert.match(chunk, /без Alfa/);
    assert.match(exp, /recoverCreatedPay/);
    assert.match(exp, /verifyCreate/);
    assert.match(exp, /instantPay/);
    assert.match(exp, /flushExportJobs/);
    assert.match(exp, /opts\?\.match/);
    const alfa = readFileSync(new URL("./alfacrm.ts", import.meta.url), "utf8");
    assert.match(alfa, /waitSharedGap/);
    assert.match(alfa, /loginFetch/);
    assert.match(alfa, /retry401/);
    const pack = readFileSync(new URL("./crm-packet-queue.ts", import.meta.url), "utf8");
    assert.match(pack, /if \(!alfaLinkedNow\(\)\)/);
    assert.match(pack, /wantAlfaPullChannel\("clients"\)/);
    assert.match(pack, /wantAlfaPullChannel\("customers"\)/);
    assert.match(pack, /wantAlfaPullChannel\("lessons"\)/);
    assert.match(pack, /extra: "без Alfa"/);
    const sched = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(sched, /wantAlfaPull\(data.fresh\)/);
    assert.match(sched, /alfaLinkSave/);
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /Фон с AlfaCRM/);
    assert.match(ui, /Загрузить историю из Alfa/);
    assert.match(ui, /ALFA_PUSH_CH/);
    assert.match(ui, /ALFA_PIPE_CH/);
    assert.match(ui, /Касса за/);
    assert.match(ui, /Труба в Alfa/);
    assert.match(ui, /saveSync/);
    const link = readFileSync(new URL("./crm-alfa-link.ts", import.meta.url), "utf8");
    assert.match(link, /wantAlfaDelta/);
    assert.match(link, /wantAlfaPush/);
    assert.match(link, /deltaAllowed/);
    assert.match(link, /pushAllowed/);
    const save = readFileSync(new URL("./trial-save.ts", import.meta.url), "utf8");
    assert.match(save, /enqueueExport/);
    assert.match(save, /actor: "consultant"/);
    assert.match(save, /customer.create/);
    assert.match(save, /lesson.create/);
  });
});
