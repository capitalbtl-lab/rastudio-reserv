import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeCrmPacket, overlayStale, overlayEnqueueOffset, pickNextPacket, type CrmPacket } from "./crm-packet-queue-core.ts";

describe("очередь пакетов CRM", () => {
  it("два overlay схлопываются в меньший offset", () => {
    let q: CrmPacket[] = [];
    q = mergeCrmPacket(q, { kind: "overlay", offset: 12 });
    q = mergeCrmPacket(q, { kind: "overlay", offset: 3 });
    assert.equal(q.length, 1);
    assert.equal(q[0].kind, "overlay");
    assert.equal(q[0].kind === "overlay" && q[0].offset, 3);
  });

  it("группа впереди overlay, дубль группы не копится", () => {
    let q: CrmPacket[] = [];
    q = mergeCrmPacket(q, { kind: "overlay", offset: 0 });
    q = mergeCrmPacket(q, { kind: "group", branchId: 2, groupId: 453 });
    q = mergeCrmPacket(q, { kind: "group", branchId: 2, groupId: 453 });
    assert.equal(q.filter((p) => p.kind === "group").length, 1);
    const next = pickNextPacket(q);
    assert.equal(next?.kind, "group");
  });

  it("ученики одного филиала сливаются", () => {
    let q: CrmPacket[] = [];
    q = mergeCrmPacket(q, { kind: "customers", branchId: 1, ids: [10, 11] });
    q = mergeCrmPacket(q, { kind: "customers", branchId: 1, ids: [11, 12] });
    assert.equal(q.length, 1);
    assert.deepEqual(q[0].kind === "customers" ? q[0].ids : [], [10, 11, 12]);
  });

  it("круг не свежий, пока пакеты не дошли до конца или вышел TTL", () => {
    assert.equal(overlayStale({ cache: true, ttlMin: 30, overlayAt: new Date().toISOString(), overlayNext: 10, overlayTotal: 80 }), true);
    assert.equal(overlayStale({ cache: true, ttlMin: 30, overlayAt: new Date().toISOString(), overlayNext: 80, overlayTotal: 80 }), false);
    assert.equal(
      overlayStale({ cache: true, ttlMin: 1, overlayAt: new Date(Date.now() - 120000).toISOString(), overlayNext: 80, overlayTotal: 80 }),
      true,
    );
    assert.equal(overlayStale({ cache: false, ttlMin: 30, overlayAt: new Date().toISOString(), overlayNext: 80, overlayTotal: 80 }), true);
  });

  it("готовый свежий cgi-круг не ставится в очередь снова", () => {
    const skip = overlayEnqueueOffset({ fromStart: false, overlayNext: 76, overlayTotal: 76, stale: false });
    assert.equal(skip.skip, true);
    const resume = overlayEnqueueOffset({ fromStart: false, overlayNext: 27, overlayTotal: 76, stale: true });
    assert.equal(resume.skip, false);
    assert.equal(resume.offset, 27);
    const restart = overlayEnqueueOffset({ fromStart: false, overlayNext: 76, overlayTotal: 76, stale: true });
    assert.equal(restart.restart, true);
    assert.equal(restart.offset, 0);
  });
});
