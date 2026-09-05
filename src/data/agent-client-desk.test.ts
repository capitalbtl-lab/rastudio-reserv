import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { digestPrompt, type ClientDigest } from "./agent-client-desk-core.ts";

describe("действующий клиент: стол консультанта", () => {
  it("карточка только по customerId, без угадывания группы", () => {
    const d: ClientDigest = {
      customerId: 11,
      child: "Петя",
      parent: "Иванова",
      branchId: 1,
      groups: [{ groupId: 580, branchId: 1, name: "Роботы 2026", courseId: "/art-studio-10-14", next: "Пн 16:00" }],
      nextLesson: "Пн 16:00",
      lastLessons: ["2026-09-01 проведено"],
      balance: 4,
      tariff: "живой",
      pauseUntil: "",
    };
    const text = digestPrompt(d);
    assert.match(text, /customerId 11/);
    assert.match(text, /gid=580/);
    assert.match(text, /courseId=\/art-studio-10-14/);
    assert.match(text, /note_skip/);
    assert.doesNotMatch(text, /похож/);
  });

  it("инструменты в чате и галочки в окне", () => {
    const chat = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(chat, /name: "client_card"/);
    assert.match(chat, /name: "note_skip"/);
    assert.match(chat, /name: "pause_classes"/);
    assert.match(chat, /name: "assign_tariff"/);
    assert.match(chat, /consultantCanJournal/);
    const cfg = readFileSync(new URL("./agent-config.ts", import.meta.url), "utf8");
    assert.match(cfg, /consultantCanJournal/);
    assert.match(cfg, /consultantCanTariff/);
    const map = readFileSync(new URL("../components/admin-schedule-map.tsx", import.meta.url), "utf8");
    assert.match(map, /Схема/);
    assert.match(map, /layout === "scheme"/);
  });
});
