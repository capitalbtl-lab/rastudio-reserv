import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bargeInterimReady,
  emptyVad,
  ignoreAfterSpeakMs,
  isVoiceEcho,
  srFatal,
  srShouldRestart,
  vadTick,
} from "./agent-voice-loop.ts";

describe("голосовой контур: эхо и перебивание", () => {
  it("эхо только пока звучит своя фраза, короткое «да» не глотает", () => {
    assert.equal(isVoiceEcho("да", "Назовите дату и время"), false);
    assert.equal(isVoiceEcho("суббота", "Ближайшее занятие в пятницу"), false);
    assert.equal(
      isVoiceEcho("назовите дату и время удобные для вас", "Назовите дату и время, удобные для вас"),
      true,
    );
    assert.equal(
      isVoiceEcho("назовите дату и время", "Назовите дату и время, удобные для вас", { spokenAgoMs: 2000 }),
      false,
    );
  });

  it("VAD срабатывает на речь, не на шум 0.02", () => {
    let s = emptyVad();
    for (let i = 0; i < 20; i++) {
      const r = vadTick(s, 0.012, true);
      s = r.state;
      assert.equal(r.fire, false);
    }
    let fired = false;
    for (let i = 0; i < 8; i++) {
      const r = vadTick(s, 0.09, true);
      s = r.state;
      if (r.fire) fired = true;
    }
    assert.equal(fired, true);
    const off = vadTick(emptyVad(), 0.2, false);
    assert.equal(off.fire, false);
  });

  it("перебивание по interim — от двух слов, финал — от одного", () => {
    assert.equal(bargeInterimReady("да", false), false);
    assert.equal(bargeInterimReady("перенесите занятие", false), true);
    assert.equal(bargeInterimReady("суббота", true), true);
    assert.equal(srFatal("not-allowed"), true);
    assert.equal(srShouldRestart("no-speech"), true);
    assert.equal(srShouldRestart("aborted"), true);
    assert.ok(ignoreAfterSpeakMs(true) < 200);
  });

  it("окно держит распознавание во время речи и перезапускает после ошибки", () => {
    const chat = readFileSync(new URL("../components/agent-chat.tsx", import.meta.url), "utf8");
    assert.match(chat, /from "@\/data\/agent-voice-loop"/);
    assert.match(chat, /vadTick/);
    assert.match(chat, /srShouldRestart/);
    assert.match(chat, /bargeInterimReady/);
    assert.doesNotMatch(chat, /stopListen\(true\);\s*\n\s*\}/);
    assert.match(chat, /startListen\(\);\s*\n\s*if \(bargeRef/);
  });
});
