import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { actorOf, actorLabel, CRM_ACTORS, defaultActorsState } from "./crm-actors.ts";

describe("акторы кабинета", () => {
  it("четыре роли, без пятой", () => {
    assert.deepEqual(
      CRM_ACTORS.map((a) => a.id),
      ["human", "assistant", "consultant", "sync"],
    );
    assert.equal(defaultActorsState().actors.length, 4);
  });

  it("чужое значение — сотрудник", () => {
    assert.equal(actorOf("assistant"), "assistant");
    assert.equal(actorOf("consultant"), "consultant");
    assert.equal(actorOf(""), "human");
    assert.equal(actorOf("admin"), "human");
  });

  it("подпись человека берётся с диска", () => {
    assert.equal(actorLabel("human", "Ольга"), "Ольга");
    assert.equal(actorLabel("sync"), "Очередь Alfa");
  });
});
