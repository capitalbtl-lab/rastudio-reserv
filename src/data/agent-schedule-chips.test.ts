import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chipsForReply, needTypedText, typedPrompt } from "./agent-chips.ts";

describe("расписание кнопками, не простынёй", () => {
  it("окно и чипы: слоты вместо филиала, подпись после кнопок", () => {
    const chips = readFileSync(new URL("./agent-chips.ts", import.meta.url), "utf8");
    assert.match(chips, /function scheduleOffer/);
    assert.match(chips, /Выберите удобное время, и я запишу вас в группу/);
    assert.match(chips, /какой ближе\|цмит или гражданск/);
    const chat = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(chat, /slotChips\(shown, "group"\)/);
    assert.match(chat, /слоты уйдут кнопками/i);
    const ui = readFileSync(new URL("../components/agent-chat.tsx", import.meta.url), "utf8");
    assert.match(ui, /offer\.after/);
    assert.match(ui, /chip\.note/);
    const fmt = readFileSync(new URL("./alfacrm-schedule.ts", import.meta.url), "utf8");
    assert.match(fmt, /В речи родителю НЕ читай этот список/);
    const note = readFileSync(new URL("./session-note.ts", import.meta.url), "utf8");
    assert.match(note, /body = clipScheduleSpeech\(body\)/);
  });

  it("телефон нельзя кнопкой — поле мигает, темы не перекрывают", () => {
    const phone = "Ольга: Напишите телефон, который указывали при записи. По нему открою карточку на сайте.";
    const offer = chipsForReply(phone, [
      { role: "assistant", content: "Вы уже занимаетесь?" },
      { role: "user", content: "мы уже занимаемся" },
      { role: "assistant", content: phone },
    ]);
    assert.equal(offer.chips.length, 0);
    assert.equal(needTypedText(phone, offer.chips), true);
    assert.match(typedPrompt(phone), /телефон/i);
    assert.equal(needTypedText("Скажите или напишите возраст или нажмите кнопку.", [{ label: "7–9 лет" }]), false);
  });
});
