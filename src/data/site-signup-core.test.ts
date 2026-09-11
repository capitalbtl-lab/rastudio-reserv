import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SITE_SIGNUP_DEFAULT, normalizeTrialHref, trialFormUrl, trialUrlFor } from "./site-signup-core.ts";

describe("форма пробного с сайта", () => {
  it("шаблон — id=20, источник 2, компания 2", () => {
    const href = trialFormUrl(1);
    assert.match(href, /\/common\/2\/form\/draw\?id=20/);
    assert.match(href, /lead_source_id=2/);
    assert.equal(trialFormUrl(3), trialFormUrl(2));
  });

  it("админка филиала 1 со сток-ссылкой common/1 → common/2", () => {
    const raw = "https://studiyarazvivaysya.s20.online/common/1/form/draw?id=20&lead_source_id=2&baseColor=205EDC";
    assert.match(normalizeTrialHref(raw), /\/common\/2\/form\/draw\?id=20/);
    const signup = { ...SITE_SIGNUP_DEFAULT, trialByBranch: { ...SITE_SIGNUP_DEFAULT.trialByBranch, "1": raw } };
    assert.match(trialUrlFor(signup, 1), /\/common\/2\/form\/draw\?id=20/);
  });

  it("чужой id формы из админки не переписываем", () => {
    const raw = "https://studiyarazvivaysya.s20.online/common/2/form/draw?id=8&lead_source_id=2";
    assert.equal(normalizeTrialHref(raw), raw);
  });

  it("кнопка на сайте берёт trialUrlFor", () => {
    const src = readFileSync(new URL("../components/group-ctas.tsx", import.meta.url), "utf8");
    assert.match(src, /trialUrlFor/);
    assert.match(src, /<a\s+href=\{trialHref\}/);
  });

  it("блок формы на сайте — iframe этой ссылки", () => {
    const src = readFileSync(new URL("../components/trial-form.tsx", import.meta.url), "utf8");
    assert.match(src, /trialUrlFor/);
    assert.match(src, /<iframe/);
    assert.doesNotMatch(src, /sendTrial/);
  });
});
