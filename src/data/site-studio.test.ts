import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mediaContext, mediaFolder, matchMediaLabel } from "./media-context.ts";
import { asPageAgent, emptyPageAgent, pageAgentPrompt, safeSitePath } from "./page-agents-core.ts";
import { addCustomBlock, normalizeHomeLayout, setHomeMedia, setHomeText } from "./home-layout-core.ts";

describe("медиа и агенты страниц", () => {
  it("папка курса узнаётся из пути файла", () => {
    const ctx = mediaContext("/media/courses/robototehnika-v-kolomne/01.jpg", [
      { id: "/robototehnika-v-kolomne", label: "Робототехника в Коломне" },
    ]);
    assert.equal(mediaFolder(ctx.src), "robototehnika-v-kolomne");
    assert.equal(ctx.place, "Робототехника в Коломне");
    assert.equal(ctx.kind, "image");
    assert.ok(matchMediaLabel("art-studio", [{ id: "/art-studio", label: "Художка" }]));
    assert.equal(mediaContext("/media/home/hero.mp4").place.includes("ресепшн") || mediaContext("/media/home/hero.mp4").place.includes("главн"), true);
  });

  it("путь агента не пускает кабинет и позволяет курс", () => {
    assert.equal(safeSitePath("/admin"), "");
    assert.equal(safeSitePath("/api/x"), "");
    assert.equal(safeSitePath("../etc"), "");
    assert.equal(safeSitePath("/robototehnika-v-kolomne"), "/robototehnika-v-kolomne");
    assert.equal(safeSitePath("#trial"), "#trial");
    const a = asPageAgent({ path: "/art-studio", on: true, who: "oleg", autoOpenSec: 12, steer: true, focus: "рисунок" });
    assert.equal(a?.who, "oleg");
    assert.equal(a?.autoOpenSec, 12);
    assert.match(pageAgentPrompt(a, "/art-studio"), /open_page/);
    assert.equal(pageAgentPrompt(emptyPageAgent("/"), "/"), "");
  });

  it("медиа и свой блок пишутся в макет", () => {
    let doc = addCustomBlock(normalizeHomeLayout({}), { kicker: "Сезон", title: "Лето", text: "Интенсив." });
    const id = doc.customs[0].id;
    doc = setHomeMedia(doc, id, "/media/uploads/x.jpg");
    doc = setHomeText(doc, `${id}.title`, "Летний интенсив");
    assert.equal(doc.media[id], "/media/uploads/x.jpg");
    assert.equal(doc.texts[`${id}.title`], "Летний интенсив");
    assert.ok(doc.order.includes(id));
  });
});
