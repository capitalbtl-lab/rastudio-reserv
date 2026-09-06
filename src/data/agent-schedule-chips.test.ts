import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clipScheduleSpeech } from "./session-note.ts";
import { scheduleChipOf } from "./alfacrm-schedule.ts";

describe("расписание кнопками, не простынёй", () => {
  it("нумерованный список слотов срезается до вводной фразы", () => {
    const dumped =
      "В художественной школе для 12 лет в ЦМИТ на Октябрьской революции, 340 есть несколько групп: 1. Художественная школа (10–14 лет), Четверг с 15:00 до 18:00, педагог Нина Константиновна, набор до 20 мест, ближайшее занятие 10.09.2026. 2. Скульптурная студия (8+), Пятница с 18:30. Выберите удобное время, и я запишу вас в группу.";
    const clipped = clipScheduleSpeech(dumped);
    assert.match(clipped, /есть несколько групп:$/);
    assert.doesNotMatch(clipped, /1\.\s/);
    assert.doesNotMatch(clipped, /Четверг/);
  });

  it("кнопка слота: день, название, комментарий с педагогом и местами", () => {
    const chip = scheduleChipOf({
      name: "Художественная школа (10–14 лет)",
      chip: "Чт 15:00–18:00 · ЦМИТ · набор",
      teacher: "Мормуль Нина Константиновна",
      seats: "набор до 20 мест",
      nextDate: "10.09.2026",
      priority: 1,
    });
    assert.match(chip.label, /Чт 15:00–18:00/);
    assert.match(chip.label, /Художественная школа/);
    assert.match(chip.note, /Нина Константиновна/);
    assert.match(chip.note, /набор до 20 мест/);
    assert.match(chip.note, /ближайшее 10\.09\.2026/);
  });

  it("окно и чипы: слоты вместо филиала, подпись после кнопок", () => {
    const chips = readFileSync(new URL("./agent-chips.ts", import.meta.url), "utf8");
    assert.match(chips, /function scheduleOffer/);
    assert.match(chips, /Выберите удобное время, и я запишу вас в группу/);
    assert.match(chips, /какой ближе\|цмит или гражданск/);
    assert.doesNotMatch(chips, /if \(\/цмит\|октябрьской революции\|гражданская, 2\|какой ближе\/\.test/);
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
});
