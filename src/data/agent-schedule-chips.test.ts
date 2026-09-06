import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
    const chips = readFileSync(new URL("./agent-chips.ts", import.meta.url), "utf8");
    const phoneAt = chips.indexOf("if (/телефон|по нему открою/");
    const topicsAt = chips.indexOf("if (/карточк|абонемент");
    assert.ok(phoneAt > 0 && phoneAt < topicsAt);
    assert.match(chips, /export function needTypedText/);
    assert.match(chips, /напишите телефон\|телефон, который указывали/);
    assert.match(chips, /export function typedPrompt/);
    const ui = readFileSync(new URL("../components/agent-chat.tsx", import.meta.url), "utf8");
    assert.match(ui, /agent-input-wink/);
    assert.match(ui, /needTypedText/);
    assert.equal(/voiceOn && uiOn\("allowVoice"\) \? null/.test(ui), false);
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    assert.match(css, /@keyframes agent-input-wink/);
  });
});