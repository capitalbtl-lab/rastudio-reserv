import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  SITE_SIGNUP_DEFAULT,
  groupCardSignup,
  isTrialHref,
  parseTrialEmbed,
  trialFormUrl,
  trialIframeHtml,
  trialUrlFor,
  withAlfaFormCss,
} from "./site-signup-core.ts";

describe("форма пробного с сайта", () => {
  it("из iframe достаём src формы 20", () => {
    const html = trialIframeHtml();
    const src = parseTrialEmbed(html);
    assert.match(html, /<iframe /);
    assert.match(src, /\/common\/2\/form\/draw\?id=20/);
    assert.match(src, /lead_source_id=2/);
    assert.equal(src.startsWith("https://"), true);
    assert.equal(src.includes("<iframe"), false);
  });

  it("голый URL тоже принимаем", () => {
    assert.equal(parseTrialEmbed(trialFormUrl()), trialFormUrl());
  });

  it("админка филиала 1 со сток-ссылкой common/1 → common/2", () => {
    const raw = "https://studiyarazvivaysya.s20.online/common/1/form/draw?id=20&lead_source_id=2";
    const signup = { ...SITE_SIGNUP_DEFAULT, trialByBranch: { ...SITE_SIGNUP_DEFAULT.trialByBranch, "1": raw } };
    assert.match(trialUrlFor(signup, 1), /\/common\/2\/form\/draw\?id=20/);
  });

  it("чужой id формы из iframe не переписываем", () => {
    const raw = '<iframe src="https://studiyarazvivaysya.s20.online/common/2/form/draw?id=8&lead_source_id=2" width="100%" height="100%" frameborder="0"></iframe>';
    assert.match(parseTrialEmbed(raw), /id=8/);
  });

  it("форма Alfa со своим css, не rastudio", () => {
    const src = withAlfaFormCss(
      "https://studiyarazvivaysya.s20.online/common/2/form/draw?id=20&lead_source_id=2&css=https://www.rastudio.org/trial-form.css",
    );
    assert.match(src, /cdn\.alfacrm\.pro%2Flead-form%2Fform\.css|cdn\.alfacrm\.pro\/lead-form\/form\.css/);
    assert.match(trialFormUrl(), /cdn\.alfacrm\.pro/);
    assert.doesNotMatch(trialFormUrl(), /trial-form\.css/);
    assert.match(trialFormUrl(), /borderRadius=8/);
  });

  it("кнопка пробного открывает окно сайта, не вкладку Alfa", () => {
    const src = readFileSync(new URL("../components/group-ctas.tsx", import.meta.url), "utf8");
    assert.match(src, /openTrialForm/);
    assert.match(src, /groupCardSignup/);
  });

  it("оболочка сайта вешает TrialPopup", () => {
    const src = readFileSync(new URL("../components/site-shell.tsx", import.meta.url), "utf8");
    assert.match(src, /TrialPopup/);
  });

  it("окно пробного блокирует прокрутку страницы", () => {
    const src = readFileSync(new URL("../components/trial-popup.tsx", import.meta.url), "utf8");
    assert.match(src, /overflow = "hidden"/);
    assert.match(src, /onWheel/);
    assert.match(src, /TrialEmbed/);
  });

  it("на странице нет широкой формы — только кнопка во всплывающее", () => {
    const src = readFileSync(new URL("../components/trial-form.tsx", import.meta.url), "utf8");
    assert.match(src, /openTrialForm/);
    assert.doesNotMatch(src, /TrialEmbed/);
    assert.doesNotMatch(src, /lg:grid-cols/);
  });

  it("запись в группу — ссылка с карточки группы", () => {
    assert.equal(
      groupCardSignup({ branchId: 1, groupId: 454 }),
      "https://studiyarazvivaysya.s20.online/common/1/lead/create?gid=454",
    );
    assert.equal(
      groupCardSignup({ signup: "https://studiyarazvivaysya.s20.online/common/2/lead/create?gid=528", groupId: 1, branchId: 1 }),
      "https://studiyarazvivaysya.s20.online/common/2/lead/create?gid=528",
    );
    assert.equal(groupCardSignup({}), "");
    const src = readFileSync(new URL("../components/group-ctas.tsx", import.meta.url), "utf8");
    assert.match(src, /groupCardSignup/);
    assert.match(src, /target="_blank"/);
    assert.doesNotMatch(src, /onGroup\?\(\)/);
  });

  it("ссылка пробного ловится, запись в группу — нет", () => {
    assert.equal(isTrialHref("#trial"), true);
    assert.equal(isTrialHref("/art-studio#trial"), true);
    assert.equal(
      isTrialHref(
        "https://studiyarazvivaysya.s20.online/common/2/form/draw?id=20&lead_source_id=2",
      ),
      true,
    );
    assert.equal(isTrialHref("https://studiyarazvivaysya.s20.online/common/2/lead/create?gid=528"), false);
    assert.equal(isTrialHref("/schedule"), false);
  });

  it("все кнопки пробного открывают окно, не вкладку Alfa", () => {
    const files = [
      "../components/group-ctas.tsx",
      "../components/convert.tsx",
      "../components/trial-form.tsx",
      "../components/site-header.tsx",
      "../components/cms-blocks.tsx",
      "../components/site-shell.tsx",
      "../components/page-link.tsx",
      "../components/schedule-finder.tsx",
      "../components/agent-chat.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      if (file.includes("group-ctas") || file.includes("convert") || file.includes("trial-form")) {
        assert.match(src, /openTrialForm/, file);
      }
      if (file.includes("site-header") || file.includes("cms-blocks") || file.includes("site-shell")) {
        assert.match(src, /#trial/, file);
      }
      if (file.includes("page-link") || file.includes("schedule-finder") || file.includes("agent-chat")) {
        assert.match(src, /isTrialHref|openTrialForm/, file);
      }
    }
    const popup = readFileSync(new URL("../components/trial-popup.tsx", import.meta.url), "utf8");
    assert.match(popup, /isTrialHref/);
    assert.match(popup, /TrialEmbed/);
  });
});
