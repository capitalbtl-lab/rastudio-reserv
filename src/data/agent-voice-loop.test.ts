import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bargeInterimReady,
  emptyVad,
  ignoreAfterSpeakMs,
  isSocialHello,
  isVoiceEcho,
  srFatal,
  srShouldRestart,
  vadTick,
} from "./agent-voice-loop.ts";

const HELLO = "Здравствуйте. Я Ольга, студия Развивайся. Вы уже занимаетесь у нас или подбираете впервые?";

describe("голосовой контур: эхо и перебивание", () => {
  it("свой голос — эхо на всём протяжении фразы, «привет» — нет", () => {
    assert.equal(isVoiceEcho("да", "Назовите дату и время"), false);
    assert.equal(isVoiceEcho("суббота", "Ближайшее занятие в пятницу"), false);
    assert.equal(
      isVoiceEcho("назовите дату и время удобные для вас", "Назовите дату и время, удобные для вас"),
      true,
    );
    assert.equal(isVoiceEcho("привет", HELLO, { speaking: true }), false);
    assert.equal(isVoiceEcho("здравствуйте", HELLO, { speaking: true }), true);
    assert.equal(
      isVoiceEcho("вы уже занимаетесь у нас или подбираете впервые", HELLO, { speaking: true, spokenAgoMs: 2500 }),
      true,
    );
    assert.equal(
      isVoiceEcho("назовите дату и время", "Назовите дату и время, удобные для вас", { spokenAgoMs: 2500 }),
      false,
    );
    assert.equal(isVoiceEcho("уже ходим", HELLO, { speaking: true }), false);
    assert.equal(isSocialHello("Привет"), true);
    assert.equal(isSocialHello("добрый день"), true);
    assert.equal(isSocialHello("уже ходим"), false);
  });

  it("VAD срабатывает на речь, не на шум 0.02", () => {
    let s = emptyVad();
    for (let i = 0; i < 20; i++) {
      const r = vadTick(s, 0.012, true);
      s = r.state;
      assert.equal(r.fire, false);
    }
    let fired = false;
    for (let i = 0; i < 12; i++) {
      const r = vadTick(s, 0.12, true);
      s = r.state;
      if (r.fire) fired = true;
    }
    assert.equal(fired, true);
    const off = vadTick(emptyVad(), 0.2, false);
    assert.equal(off.fire, false);
  });

  it("перебивание по interim — от двух слов, финал — от одного; привет — только финал", () => {
    assert.equal(bargeInterimReady("да", false), false);
    assert.equal(bargeInterimReady("перенесите занятие", false), true);
    assert.equal(bargeInterimReady("суббота", false), true);
    assert.equal(bargeInterimReady("суббота", true), true);
    assert.equal(bargeInterimReady("привет", false), false);
    assert.equal(bargeInterimReady("привет", true), true);
    assert.equal(srFatal("not-allowed"), true);
    assert.equal(srShouldRestart("no-speech"), true);
    assert.equal(srShouldRestart("aborted"), true);
    assert.ok(ignoreAfterSpeakMs(true) >= 400);
    assert.ok(ignoreAfterSpeakMs(true) < 1500);
  });

  it("окно не глушит TTS по VAD колонок, держит распознавание", () => {
    const chat = readFileSync(new URL("../components/agent-chat.tsx", import.meta.url), "utf8");
    assert.match(chat, /from "@\/data\/agent-voice-loop"/);
    assert.match(chat, /vadTick/);
    assert.match(chat, /srShouldRestart/);
    assert.match(chat, /bargeInterimReady/);
    assert.match(chat, /isSocialHello/);
    assert.doesNotMatch(chat, /if \(next\.fire\) \{\s*stop\(\);\s*cancelSpeech/);
    assert.match(chat, /startListen\(\);\s*\n\s*if \(bargeRef/);
    assert.match(chat, /if \(!bargeInterimReady\(said, isFinal\)\) return;/);
    assert.match(chat, /cancelSpeech\(\);\s*\n\s*void send\(said\);/);
    assert.match(chat, /el\.volume = Math.min\(el\.volume, 0\.28\)/);
  });
});
