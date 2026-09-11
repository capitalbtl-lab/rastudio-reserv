import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  SITE_SIGNUP_DEFAULT,
  parseTrialEmbed,
  trialFormUrl,
  trialIframeHtml,
  trialUrlFor,
  withSiteTrialCss,
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

  it("подставляет CSS rastudio, даже если в админке старый cdn Alfa", () => {
    const src = withSiteTrialCss(
      "https://studiyarazvivaysya.s20.online/common/2/form/draw?id=20&lead_source_id=2&css=//cdn.alfacrm.pro/lead-form/form.css",
    );
    assert.match(src, /rastudio\.org%2Ftrial-form\.css|rastudio\.org\/trial-form\.css/);
    assert.match(trialFormUrl(), /trial-form\.css/);
  });

  it("кнопка пробного открывает окно сайта, не вкладку Alfa", () => {
    const src = readFileSync(new URL("../components/group-ctas.tsx", import.meta.url), "utf8");
    assert.match(src, /openTrialForm/);
    assert.doesNotMatch(src, /target="_blank"/);
  });

  it("оболочка сайта вешает TrialPopup", () => {
    const src = readFileSync(new URL("../components/site-shell.tsx", import.meta.url), "utf8");
    assert.match(src, /TrialPopup/);
  });

  it("запись в группу остаётся формой rastudio", () => {
    const src = readFileSync(new URL("../components/trial-modal.tsx", import.meta.url), "utf8");
    assert.match(src, /Запись в группу/);
    assert.match(src, /sendTrial/);
  });
});
