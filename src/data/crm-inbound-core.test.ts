import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inboundTake, pendingEntityIds, mergeJournalInbound } from "./crm-inbound-core.ts";

describe("вход из Alfa", () => {
  it("очередь старше входа", () => {
    assert.equal(inboundTake({ pending: true }), "skip");
    assert.equal(inboundTake({ pending: false }), "alfa");
    const hold = pendingEntityIds(
      [
        { op: "lesson.update", entityId: 15 },
        { op: "lesson.create", entityId: -3, body: { localId: -3 } },
        { op: "customer.update", entityId: 9 },
      ],
      ["lesson.update", "lesson.create"],
    );
    assert.equal(hold.has(15), true);
    assert.equal(hold.has(-3), true);
    assert.equal(hold.has(9), false);
  });

  it("журнал: свои id и очередь не затираются снимком Alfa", () => {
    const pulled = [
      { lessonId: 15, date: "2026-09-05", from: "16:00", status: 1 },
      { lessonId: 16, date: "2026-09-06", from: "16:00", status: 3 },
    ];
    const prev = [
      { lessonId: 15, date: "2026-09-05", from: "16:00", status: 3, customerIds: [10] },
      { lessonId: -4, date: "2026-09-07", from: "16:00", status: 1 },
    ];
    const merged = mergeJournalInbound(pulled, prev, [15]);
    const ours = merged.find((x) => x.lessonId === 15);
    assert.equal(ours?.status, 3);
    assert.deepEqual(ours && "customerIds" in ours ? ours.customerIds : [], [10]);
    assert.equal(merged.some((x) => x.lessonId === -4), true);
    assert.equal(merged.find((x) => x.lessonId === 16)?.status, 3);
  });

  it("фон: union не стирает старые занятия вне окна Alfa", () => {
    const pulled = [{ lessonId: 16, date: "2026-09-06", from: "16:00", status: 3 }];
    const prev = [
      { lessonId: 99, date: "2026-06-01", from: "16:00", status: 3 },
      { lessonId: 16, date: "2026-09-06", from: "16:00", status: 1 },
      { lessonId: 15, date: "2026-09-05", from: "16:00", status: 3, customerIds: [10] },
    ];
    const merged = mergeJournalInbound(pulled, prev, [15], "union");
    assert.equal(merged.find((x) => x.lessonId === 99)?.status, 3);
    assert.equal(merged.find((x) => x.lessonId === 16)?.status, 3);
    assert.equal(merged.find((x) => x.lessonId === 15)?.status, 3);
  });
});
