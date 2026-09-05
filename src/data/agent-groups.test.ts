import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAskToTree, slotFitsAgent, agentGroupLine } from "./agent-groups.ts";

const tree = {
  schools: [
    { id: "/art-studio", href: "/art-studio", label: "Художественная школа" },
    { id: "/robototehnika-v-kolomne", href: "/robototehnika-v-kolomne", label: "Школа робототехники" },
    { id: "/model-school", href: "/model-school", label: "Модельная школа" },
  ],
  courses: [
    { id: "/art-studio-10-14", href: "/art-studio-10-14", schoolId: "/art-studio", label: "10-14", age: "10-14" },
    { id: "/art-studio-5-6", href: "/art-studio-5-6", schoolId: "/art-studio", label: "5-6", age: "5-6" },
    { id: "/model-school-podium", href: "/model-school-podium", schoolId: "/model-school", label: "Подиум", age: "9-14" },
  ],
};

describe("ИИ подбирает группы по ID дерева", () => {
  it("речь «робототехника» → schoolId, не имя группы", () => {
    assert.deepEqual(resolveAskToTree("робототехника", tree), {
      schoolId: "/robototehnika-v-kolomne",
      courseId: "",
    });
    assert.equal(resolveAskToTree("/art-studio-10-14", tree).courseId, "/art-studio-10-14");
    assert.deepEqual(resolveAskToTree("рисовать 10-14", tree), {
      schoolId: "/art-studio",
      courseId: "/art-studio-10-14",
    });
    assert.equal(resolveAskToTree("art-studio-10-14", tree).courseId, "/art-studio-10-14");
  });

  it("группа с чужим courseId не попадает в робототехнику, даже если в имени «робот»", () => {
    const fake = {
      groupId: 580,
      branchId: 1,
      statusId: 2,
      courseId: "/art-studio-10-14",
      schoolId: "/art-studio",
      path: "/art-studio-10-14",
      groupName: "Робототехника 2026",
    };
    assert.equal(slotFitsAgent(fake, { course: "робототехника" }, tree), false);
    assert.equal(slotFitsAgent(fake, { courseId: "/art-studio-10-14" }, tree), true);
    assert.equal(slotFitsAgent(fake, { course: "рисовать 10-14" }, tree), true);
    assert.equal(slotFitsAgent(fake, { course: "рисовать 5-6" }, tree), false);
  });

  it("неизвестная фраза не ищет по названию группы", () => {
    const slot = {
      groupId: 1,
      branchId: 1,
      statusId: 2,
      courseId: "/model-school-podium",
      schoolId: "/model-school",
      groupName: "блабла",
    };
    assert.equal(slotFitsAgent(slot, { course: "блабла" }, tree), false);
  });

  it("courseId в запросе сильнее речи, python не клеит художественную группу", () => {
    const art = {
      groupId: 580,
      branchId: 1,
      statusId: 2,
      courseId: "/art-studio-10-14",
      schoolId: "/art-studio",
    };
    assert.equal(slotFitsAgent(art, { course: "python", courseId: "/art-studio-10-14" }, tree), true);
    assert.equal(slotFitsAgent(art, { course: "python" }, tree), false);
  });

  it("строка для модели содержит courseId и состав, не предлагает угадать", () => {
    const line = agentGroupLine({
      gid: "580",
      branchId: 1,
      priority: 1,
      courseId: "/art-studio-10-14",
      schoolId: "/art-studio",
      taken: 8,
      limit: 12,
    });
    assert.match(line, /courseId=\/art-studio-10-14/);
    assert.match(line, /состав 8\/12/);
    assert.match(line, /gid=580/);
  });
});
