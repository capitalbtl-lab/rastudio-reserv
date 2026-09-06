import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clipScheduleSpeech, guardReply } from "./session-note.ts";
import { chipsForReply } from "./agent-chips.ts";
import { scheduleChipOf } from "./alfacrm-schedule.ts";

describe("расписание кнопками, не простынёй", () => {
  it("нумерованный список слотов срезается до вводной фразы", () => {
    const dumped = `Ольга: В художественной школе для 12 лет в ЦМИТ на Октябрьской революции, 340 есть несколько групп: 1. Художественная школа (10–14 лет), Четверг с 15:00 до 18:00, педагог Нина Константиновна, набор до 20 мест, ближайшее занятие 10.09.2026. 2. Скульптурная студия (8+), Пятница с 18:30. Выберите удобное время, и я запишу вас в группу.`;
    const clipped = clipScheduleSpeech(dumped.replace(/^Ольга:\s*/, ""));
    assert.match(clipped, /есть несколько групп:$/);
    assert.doesNotMatch(clipped, /1\.\s/);
    assert.doesNotMatch(clipped, /Четверг/);
    const guarded = guardReply(dumped, { mode: "new", age: 12, city: "Коломна", branchId: 2, school: "художественная" });
    assert.match(guarded, /есть несколько групп:/);
    assert.doesNotMatch(guarded, /ближайшее занятие 10\.09/);
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

  it("при слотах не показывает филиал, даже если в тексте ЦМИТ", () => {
    const groups = [
      {
        label: "Чт 15:00–18:00 · Художественная школа (10–14 лет)",
        note: "Нина Константиновна · набор до 20 мест · ближайшее 10.09.2026",
        send: "Запишите в группу gid=580 филиал=2 дата=10.09.2026 время=15:00",
        primary: true,
      },
    ];
    const offer = chipsForReply(
      "Ольга: В художественной школе для 12 лет в ЦМИТ на Октябрьской революции, 340 есть несколько групп:",
      [
        { role: "assistant", content: "Ольга: Подбираем впервые?" },
        { role: "user", content: "Подбираем курс впервые" },
        { role: "user", content: "Ребёнку 12 лет" },
        { role: "user", content: "Коломна, ЦМИТ" },
        { role: "user", content: "Интересна художественная школа" },
        { role: "assistant", content: "Ольга: В художественной школе для 12 лет в ЦМИТ на Октябрьской революции, 340 есть несколько групп:" },
      ],
      groups,
    );
    assert.equal(offer.hint, "Расписание");
    assert.equal(offer.chips[0].label, groups[0].label);
    assert.equal(offer.after, "Выберите удобное время, и я запишу вас в группу.");
    assert.doesNotMatch(offer.chips.map((c) => c.label).join(" "), /Гражданская/);
  });
});
