import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeCommsInbound, packAlfaComm, asCustomerComm, commChannelOf, commChannelLabel, commsPrompt, type DiskComm } from "./crm-comms-core.ts";

function row(p: Partial<DiskComm> & Pick<DiskComm, "id" | "text">): DiskComm {
  return {
    customerId: 10,
    branchId: 1,
    channel: "site",
    actor: "consultant",
    who: "консультант",
    incoming: false,
    at: "2026-09-05T10:00:00.000Z",
    ...p,
  };
}

describe("лента каналов", () => {
  it("канал нормализуется, Alfa-строка пакуется", () => {
    assert.equal(commChannelOf("ВК"), "vk");
    assert.equal(commChannelOf("сайт"), "site");
    assert.equal(commChannelOf("кабинет"), "admin");
    assert.equal(commChannelLabel("vk"), "ВК");
    assert.equal(commChannelLabel("site"), "Сайт");
    const packed = packAlfaComm(
      { id: 88, comment: "напомнили", is_incoming: 0, user_name: "Маша", type_name: "SMS" },
      10,
      1,
    );
    assert.equal(packed?.id, 88);
    assert.equal(packed?.actor, "sync");
    assert.equal(packed?.text, "напомнили");
    assert.equal(asCustomerComm(packed!).who, "Маша");
  });

  it("вход из Alfa не затирает чат консультанта и свои id", () => {
    const prev = [
      row({ id: -3, text: "хочу пробное", incoming: true, actor: "consultant", who: "родитель" }),
      row({ id: 88, text: "старое SMS", actor: "sync", channel: "alfa" }),
    ];
    const pulled = [
      row({ id: 88, text: "новое SMS", actor: "sync", channel: "alfa" }),
      row({ id: 99, text: "ещё SMS", actor: "sync", channel: "alfa" }),
    ];
    const merged = mergeCommsInbound(pulled, prev);
    assert.equal(merged.some((x) => x.id === -3 && x.text === "хочу пробное"), true);
    assert.equal(merged.find((x) => x.id === 88)?.text, "новое SMS");
    assert.equal(merged.some((x) => x.id === 99), true);
  });

  it("промпт консультанта читает ленту, не выдумывает", () => {
    const text = commsPrompt([row({ id: -3, text: "хочу роботов", incoming: true, who: "родитель", actor: "consultant" })]);
    assert.match(text, /хочу роботов/);
    assert.match(text, /диск/);
    assert.equal(commsPrompt([]), "");
  });
});
