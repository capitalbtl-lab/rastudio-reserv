import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lessonAllowsGroup, lessonCreatePolicy, lessonOmitsRoom, LESSON_POLICY_GROUPS } from "./lesson-type-rules.ts";
import { BOOK_TYPE_FLAGS } from "./agent-book-kinds.ts";
import { CARD_LESSON_TYPES } from "./crm-cards.ts";

describe("правила типов занятий Alfa", () => {
  it("пробное и разовые без группы, групповое и отработка с группой", () => {
    assert.equal(lessonAllowsGroup(3), false);
    assert.equal(lessonAllowsGroup("trial"), false);
    assert.equal(lessonAllowsGroup("individual"), false);
    assert.equal(lessonAllowsGroup("master"), false);
    assert.equal(lessonAllowsGroup(2), true);
    assert.equal(lessonAllowsGroup("makeup"), true);
    assert.equal(lessonOmitsRoom("trial"), true);
    assert.equal(lessonOmitsRoom("group"), false);
    assert.equal(lessonCreatePolicy("individual").needTeacher, true);
    assert.equal(lessonCreatePolicy("group").needGid, true);
    assert.equal(lessonCreatePolicy("group").attachCgi, true);
    assert.equal(lessonCreatePolicy("makeup").attachCgi, false);
  });

  it("15 типов совпадают с карточкой и галочками ассистента", () => {
    assert.equal(BOOK_TYPE_FLAGS.length, 15);
    assert.equal(CARD_LESSON_TYPES.length, 15);
    const keys = new Set(BOOK_TYPE_FLAGS.map((f) => f.key));
    for (const t of CARD_LESSON_TYPES) assert.ok(keys.has(t.key), t.key);
    const grouped = LESSON_POLICY_GROUPS.flatMap((g) => [...g.keys]);
    assert.equal(grouped.length, 15);
  });

  it("консультант, очередь и админка читают одни правила", () => {
    const chat = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(chat, /lessonCreatePolicy/);
    assert.match(chat, /policy.needGid/);
    const save = readFileSync(new URL("./trial-save.ts", import.meta.url), "utf8");
    assert.match(save, /lessonCreatePolicy/);
    assert.match(save, /attachCgi/);
    assert.match(save, /stampCalendar/);
    const q = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(q, /lessonAllowsGroup/);
    const alfa = readFileSync(new URL("./alfacrm.ts", import.meta.url), "utf8");
    assert.match(alfa, /lessonAllowsGroup/);
    assert.match(alfa, /lessonOmitsRoom/);
    const play = readFileSync(new URL("./agent-playbook.ts", import.meta.url), "utf8");
    assert.match(play, /id: "makeup"/);
    assert.match(play, /id: "individual"/);
    assert.match(play, /id: "oneoff"/);
    const win = readFileSync(new URL("../components/admin-agent.tsx", import.meta.url), "utf8");
    assert.match(win, /LESSON_POLICY_GROUPS/);
  });
});
