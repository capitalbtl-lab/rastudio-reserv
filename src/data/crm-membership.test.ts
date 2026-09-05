import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activeGroupsForCard,
  applyGroupMembership,
  customerLiveInCgi,
  groupsOfCustomerFromCgi,
  packCgiRow,
  takenByGroupFromCgi,
  toCrmDay,
} from "./crm-membership.ts";

describe("членство cgi", () => {
  it("taken — живые уникальные customer_id, не group_ids и не removed", () => {
    const taken = takenByGroupFromCgi(
      [
        { group_id: 453, customer_id: 10 },
        { group_id: 453, customer_id: 11 },
        { group_id: 453, customer_id: 11 },
        { group_id: 453, customer_id: 12, removed: 1 },
        { group_id: 580, customer_id: 10, e_date: "0000-00-00" },
        { group_id: 580, customer_id: 99, e_date: "2020-01-01" },
      ],
      "2026-09-05",
    );
    assert.equal(taken.get(453), 2);
    assert.equal(taken.get(580), 1);
    assert.equal(taken.get(1), undefined);
  });

  it("карточка не подмешивает group_ids, если cgi уже есть", () => {
    const groups = activeGroupsForCard({
      cgi: [{ id: 580, name: "Роботы", branchId: 1 }],
      dossier: [
        { id: 580, name: "Роботы 7-9", branchId: 1, school: "Робототехника", active: true },
        { id: 999, name: "Лишний group_ids", branchId: 1, active: true },
      ],
    });
    assert.deepEqual(
      groups.map((g) => g.id),
      [580],
    );
    assert.equal(groups[0].school, "Робототехника");
    assert.equal(groups[0].name, "Роботы");
  });

  it("если cgi пустой — берём активные ссылки досье (оверлей), не неактивные", () => {
    const groups = activeGroupsForCard({
      cgi: [],
      dossier: [
        { id: 453, name: "Художка", branchId: 2, active: true },
        { id: 1, name: "Старая", branchId: 2, active: false },
      ],
    });
    assert.deepEqual(
      groups.map((g) => g.id),
      [453],
    );
  });

  it("фильтр customer_id на выдаче cgi, даже если API отдал чужих", () => {
    const items = [
      { group_id: 1, customer_id: 77, group_name: "А" },
      { group_id: 2, customer_id: 5, group_name: "Б" },
    ];
    assert.equal(customerLiveInCgi(items, 77, 1), true);
    assert.equal(customerLiveInCgi(items, 77, 2), false);
    assert.deepEqual(
      groupsOfCustomerFromCgi(items, 77, 2).map((g) => g.id),
      [1],
    );
  });

  it("pack читает вложенного customer и group", () => {
    const row = packCgiRow({ id: 9, customer: { id: 15 }, group: { id: 580, name: "X" }, branch_id: 1 });
    assert.equal(row?.customerId, 15);
    assert.equal(row?.groupId, 580);
    assert.equal(row?.name, "X");
    assert.equal(row?.live, true);
  });

  it("дата cgi в формате Alfa dd.mm.yyyy", () => {
    assert.equal(toCrmDay("2026-09-05"), "05.09.2026");
    assert.equal(toCrmDay("5.9.2026"), "05.09.2026");
  });

  it("добавление идёт в cgi, даже если group_ids уже содержит группу", async () => {
    const calls: string[] = [];
    let created = false;
    const request = async (path: string) => {
      calls.push(path);
      if (String(path).includes("cgi/index")) {
        return { items: created ? [{ id: 9, group_id: 453, customer_id: 77 }] : [] };
      }
      if (String(path).includes("cgi/create")) {
        created = true;
        return { success: true };
      }
      return { success: true, items: [] };
    };
    const res = await applyGroupMembership(request, "t", {
      customerId: 77,
      groupId: 453,
      branch: 2,
      drop: false,
      current: { group_ids: [453] },
    });
    assert.equal(res.ok, true);
    assert.equal(res.confirmed, true);
    assert.equal(res.already, false);
    assert.ok(calls.some((p) => p.includes("cgi/create")));
  });

  it("если cgi/create не подтвердился чтением — ошибка, не «уже в группе»", async () => {
    const request = async (path: string) => {
      if (String(path).includes("cgi/create")) return { success: true };
      return { success: true, items: [] };
    };
    const res = await applyGroupMembership(request, "t", {
      customerId: 77,
      groupId: 453,
      branch: 2,
      drop: false,
    });
    assert.equal(res.ok, false);
    assert.equal(res.confirmed, false);
  });
});
