import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  archiveEligible,
  archiveFioOk,
  archiveAgeYears,
  archiveIntersects,
  archiveRemoved,
  liveGroupKeys,
  overlayAllowsCustomer,
  addArchiveWorkingMany,
  recountArchivePolicy,
  type ArchivePerson,
  type ArchivePolicy,
} from "./crm-archive-policy.ts";

const empty: ArchivePolicy = {
  at: "",
  ready: false,
  filters: { fio: true, notAdult: true, intersectLive: true },
  working: [],
  manual: [],
  reasons: {},
};

function p(partial: Partial<ArchivePerson> & { cid: number }): ArchivePerson {
  return {
    study: 2,
    fio: "Рыбаков Николай Павлович",
    groupLinks: [],
    ...partial,
  };
}

describe("рабочий архив", () => {
  it("пересечение с группами текущих, не с пустых ссылок архивного", () => {
    const live = p({ cid: 1, study: 1, fio: "Живой", groupLinks: [{ id: 585, branchId: 2 }] });
    const mate = p({ cid: 10, fio: "Горбатюк Илья", groupLinks: [{ id: 585, branchId: 2 }] });
    const phone = p({ cid: 20, fio: "+79891234567", groupLinks: [] });
    const namedEmpty = p({ cid: 30, fio: "Орлова Арина Антоновна", groupLinks: [] });
    const keys = liveGroupKeys([live, mate, phone, namedEmpty]);
    assert.equal(archiveIntersects(mate, keys), true);
    assert.equal(archiveIntersects(phone, keys), false);
    assert.equal(archiveIntersects(namedEmpty, keys), false);
    const { policy, report } = recountArchivePolicy([live, mate, phone, namedEmpty], new Set(), empty);
    assert.equal(policy.working.includes(10), true);
    assert.equal(policy.working.includes(20), false);
    assert.equal(policy.working.includes(30), false);
    assert.equal(report.disk, 3);
    assert.equal(report.working, 1);
    assert.equal(report.hidden, 2);
  });

  it("ФИО: клиент N и телефон не проходят, имя проходит при пересечении", () => {
    assert.equal(archiveFioOk("клиент 5842"), "");
    assert.equal(archiveFioOk("+79891234567"), "");
    assert.ok(archiveFioOk("Рыбаков Николай Павлович"));
  });

  it("18+ с dob отсекается, без dob — нет", () => {
    assert.ok((archiveAgeYears("01.01.2000") || 0) >= 18);
    assert.equal(archiveAgeYears(""), undefined);
    const live = p({ cid: 1, study: 1, groupLinks: [{ id: 1, branchId: 1 }] });
    const adult = p({ cid: 2, fio: "Взрослый Иван", dob: "01.01.1990", groupLinks: [{ id: 1, branchId: 1 }] });
    const kid = p({ cid: 3, fio: "Ребёнок Петя", dob: "01.01.2016", groupLinks: [{ id: 1, branchId: 1 }] });
    const nodob = p({ cid: 4, fio: "Без Даты", groupLinks: [{ id: 1, branchId: 1 }] });
    const keys = liveGroupKeys([live, adult, kid, nodob]);
    assert.equal(archiveEligible(adult, keys), false);
    assert.equal(archiveEligible(kid, keys), true);
    assert.equal(archiveEligible(nodob, keys), true);
  });

  it("повторный прогон не снимает уже working, если группу текущих разобрали", () => {
    const first = recountArchivePolicy(
      [
        p({ cid: 1, study: 1, groupLinks: [{ id: 9, branchId: 2 }] }),
        p({ cid: 50, fio: "Бывший", groupLinks: [{ id: 9, branchId: 2 }] }),
      ],
      new Set(),
      empty,
    );
    assert.deepEqual(first.policy.working, [50]);
    const second = recountArchivePolicy(
      [p({ cid: 1, study: 1, groupLinks: [] }), p({ cid: 50, fio: "Бывший", groupLinks: [{ id: 9, branchId: 2 }] })],
      new Set(),
      first.policy,
    );
    assert.equal(second.policy.working.includes(50), true);
    assert.equal(second.report.kept, 1);
  });

  it("2→1 убирает, 1→2 остаётся в working через keep, удалённый не входит", () => {
    const live = p({ cid: 1, study: 1, groupLinks: [{ id: 3, branchId: 1 }] });
    const arch = p({ cid: 8, fio: "Выбыл", groupLinks: [{ id: 3, branchId: 1 }] });
    const first = recountArchivePolicy([live, arch], new Set(), empty);
    assert.equal(first.policy.working.includes(8), true);
    const nowLive = recountArchivePolicy(
      [p({ cid: 1, study: 1, groupLinks: [{ id: 3, branchId: 1 }] }), p({ cid: 8, study: 1, fio: "Выбыл", status: "учится", groupLinks: [{ id: 3, branchId: 1 }] })],
      new Set(),
      first.policy,
    );
    assert.equal(nowLive.policy.working.includes(8), false);
    const gone = p({ cid: 9, fio: "Удалён", status: "удалён", groupLinks: [{ id: 3, branchId: 1 }] });
    assert.equal(archiveRemoved(gone), true);
    assert.equal(archiveEligible(gone, liveGroupKeys([live, gone])), false);
  });

  it("overlay архива только working, без ready — никого", () => {
    assert.equal(overlayAllowsCustomer(1, 99, empty), true);
    assert.equal(overlayAllowsCustomer(2, 99, empty), false);
    assert.equal(overlayAllowsCustomer(0, 99, empty), false);
    const ready: ArchivePolicy = { ...empty, ready: true, working: [5] };
    assert.equal(overlayAllowsCustomer(2, 5, ready), true);
    assert.equal(overlayAllowsCustomer(2, 6, ready), false);
  });

  it("выбывший не открывает набор, пока не считали", () => {
    const next = addArchiveWorkingMany([8], "left", empty);
    assert.equal(next.ready, false);
    assert.equal(next.working.includes(8), false);
  });

  it("нет на диске — не держим в working", () => {
    const first = recountArchivePolicy(
      [
        p({ cid: 1, study: 1, groupLinks: [{ id: 9, branchId: 2 }] }),
        p({ cid: 50, fio: "Бывший", groupLinks: [{ id: 9, branchId: 2 }] }),
      ],
      new Set(),
      empty,
    );
    assert.equal(first.policy.working.includes(50), true);
    const second = recountArchivePolicy(
      [p({ cid: 1, study: 1, groupLinks: [{ id: 9, branchId: 2 }] })],
      new Set(),
      first.policy,
    );
    assert.equal(second.policy.working.includes(50), false);
    assert.equal(second.policy.reasons["50"], undefined);
  });

  it("снимок и кнопки: архив не режется 800, overlay не с текущих", () => {
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    assert.match(pull, /study === "2" \? peopleRows : peopleRows\.slice\(0, 800\)/);
    assert.match(pull, /kind === "archiveCount"/);
    assert.match(pull, /kind === "archiveCatalog"/);
    assert.match(pull, /listDossierCrm\(\)/);
    assert.match(pull, /study === "2"\) return x.study === 2 && \(scoped \|\| Boolean\(allow && allow.has\(x.cid\)\)\)/);
    assert.match(pull, /В рабочий архив можно добавить только архивного/);
    assert.doesNotMatch(pull, /enqueueExport\(/);
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(inbound, /overlayAllowsCustomer/);
    const run = readFileSync(new URL("./admin-disk-run.ts", import.meta.url), "utf8");
    assert.doesNotMatch(run, /Читаю архив AlfaCRM — иначе явка/);
    const clientsUi = readFileSync(new URL("../components/admin-clients.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(clientsUi, /void pullKind\("clientsArchive"\)/);
    assert.match(clientsUi, /История из Alfa/);
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /Посчитать отбор/);
    assert.match(ui, /Обновить справочник архива/);
    const views = readFileSync(new URL("./dossiers.ts", import.meta.url), "utf8");
    assert.match(views, /counts\.архив/);
    assert.match(views, /isArchiveWorking|archiveWorkingSet/);
  });
});
