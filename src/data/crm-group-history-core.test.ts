import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildGroupHistory,
  filterGroupHistory,
  historyKindCounts,
  ruHistoryWhen,
  type GroupHistoryInput,
} from "./crm-group-history-core.ts";

function sample(over: Partial<GroupHistoryInput> = {}): GroupHistoryInput {
  return {
    branchId: 1,
    groupId: 406,
    name: "Художественная школа (10-14 лет)",
    statusId: 2,
    bDate: "2026-05-04",
    eDate: "2026-06-30",
    subjectId: 12,
    subject: "Художественная школа (10-14 лет)",
    teacher: "Самсонова Ольга Александровна",
    at: "2026-09-11T18:10:00.000Z",
    calendar: [
      {
        date: "2026-09-11",
        from: "18:10",
        to: "20:40",
        status: 3,
        lessonId: 9001,
        teacher: "Самсонова Ольга Александровна",
        room: "аудитория 28",
      },
      { date: "2026-09-04", from: "18:10", to: "20:40", status: 1, lessonId: 9000 },
    ],
    members: [
      { customerId: 670, name: "Чуднова Александра", active: true, role: "учится" },
      { customerId: 9623, name: "", active: false, role: "архив" },
    ],
    ...over,
  };
}

describe("история группы", () => {
  it("все события периода, без явки детей", () => {
    const events = buildGroupHistory(sample());
    assert.ok(events.some((e) => e.kind === "lesson" && e.lessonId === 9001 && e.title === "Занятие проведено"));
    assert.ok(events.some((e) => e.kind === "lesson" && e.lessonId === 9000 && e.title === "Занятие в плане"));
    assert.ok(events.some((e) => e.kind === "member" && e.customerId === 670 && e.title === "Вошёл в группу"));
    assert.ok(events.some((e) => e.kind === "member" && e.customerId === 9623 && e.title === "Вышел из группы"));
    assert.ok(events.some((e) => e.kind === "group" && /statusId 2|статус группы 406: 2/.test(e.detail)));
    const card = events.find((e) => e.title === "Карточка на диске");
    assert.ok(card && /card:group:1:406/.test(card.detail) && card.detail.length > 120);
    const done = events.find((e) => e.lessonId === 9001);
    assert.match(done?.detail || "", /провед/);
    assert.match(done?.detail || "", /аудитория 28/);
    assert.match(done?.detail || "", /не выносим/);
    const left = events.find((e) => e.customerId === 9623);
    assert.match(left?.detail || "", /вышел из живого состава/);
    assert.match(left?.detail || "", /дата входа и выхода на диске не записана/i);
    const blob = JSON.stringify(events);
    assert.doesNotMatch(blob, /customerIds/);
    assert.doesNotMatch(blob, /"pupils"/);
    assert.doesNotMatch(blob, /743/);
    assert.equal(events[0].kind === "lesson" || events[0].at >= "2026-09-11", true);
    const counts = historyKindCounts(events);
    assert.equal(counts.lesson, 2);
    assert.equal(counts.member, 2);
    assert.equal(filterGroupHistory(events, "member").every((e) => e.kind === "member"), true);
  });

  it("лид отдельно, пустой календарь не падает", () => {
    const events = buildGroupHistory(
      sample({
        calendar: [],
        members: [{ customerId: 10, name: "Иванов", active: true, role: "лид" }],
        journalFill: { done: ["2026q3"], pulled: { "2026q3": "2026-09-10T04:00:00.000Z" } },
      }),
    );
    assert.ok(events.some((e) => e.title === "Лид в группе" && e.customerId === 10));
    assert.ok(events.some((e) => e.title === "Порция журнала" && /III квартал 2026/.test(e.detail) && e.detail.includes("2026q3")));
    assert.equal(historyKindCounts(events).lesson, 0);
  });

  it("дата по-русски, без даты — в конце", () => {
    assert.equal(ruHistoryWhen("2026-09-11T18:10"), "11.09.2026 18:10");
    const events = buildGroupHistory(sample({ at: "", bDate: "", calendar: [] }));
    const last = events[events.length - 1];
    assert.equal(last.kind, "member");
    assert.equal(last.at, "");
  });

  it("экран и диск, Alfa с карточки не зовём", () => {
    const core = readFileSync(new URL("./crm-group-history.ts", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../components/admin-schedule.tsx", import.meta.url), "utf8");
    const pane = readFileSync(new URL("../components/admin-group-history.tsx", import.meta.url), "utf8");
    const admin = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(core, /loadGroupCard/);
    assert.match(core, /dossiersInGroup/);
    assert.doesNotMatch(core, /from ["']\.\/alfacrm["']/);
    assert.doesNotMatch(core, /wantAlfaPull/);
    assert.match(admin, /action === "groupHistory"/);
    assert.match(admin, /loadGroupHistory/);
    assert.match(ui, /История/);
    assert.match(ui, /AdminGroupHistory/);
    assert.match(pane, /data-op="group-history"/);
    assert.match(pane, /data-op="group-history-event"/);
    assert.match(pane, /Вошёл в группу|Вышел из группы|customerId/);
    const at = admin.indexOf('data.action === "groupHistory"');
    const chunk = admin.slice(at, at + 500);
    assert.doesNotMatch(chunk, /wantAlfaPull/);
    assert.doesNotMatch(chunk, /fresh/);
  });
});
