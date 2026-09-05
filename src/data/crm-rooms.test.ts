import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { roomBelongsToBranch, roomArchived, roomsOfBranchList } from "./crm-rooms.ts";

describe("аудитории филиала", () => {
  it("только ID филиала, без подстановки всех комнат", () => {
    const raw = [
      { id: 1, name: "ЦМИТ зал", branch_ids: [2] },
      { id: 2, name: "Гражданская", branch_id: 1 },
      { id: 3, name: "Архив ЦМИТ", branch_ids: [2], is_archived: 1 },
      { id: 4, name: "Без филиала" },
    ];
    const cmit = roomsOfBranchList(raw, 2);
    assert.deepEqual(
      cmit.map((r) => r.id),
      [1],
    );
    assert.equal(roomBelongsToBranch({ branch_ids: [1] }, 2), false);
    assert.equal(roomArchived({ is_archived: 1 }), true);
  });
});
