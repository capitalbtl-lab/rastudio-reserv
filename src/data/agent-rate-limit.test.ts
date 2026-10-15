import assert from "node:assert/strict";
import { it } from "node:test";
import { chatRateKey, createChatLimiter } from "./agent-rate-limit.ts";
it("диалоги сайта не делят общий лимит сообщений", () => {
  const limited = createChatLimiter(2, 1000);
  const a = chatRateKey({ sessionId: "one" });
  const b = chatRateKey({ sessionId: "two" });
  assert.equal(limited(a, 1), false);
  assert.equal(limited(a, 2), false);
  assert.equal(limited(a, 3), true);
  assert.equal(limited(b, 3), false);
  assert.equal(limited(a, 1003), false);
});
it("ключи действующих каналов сохраняются", () => {
  assert.equal(chatRateKey({ ip: "vk:123" }), "vk:123");
  assert.equal(chatRateKey({}), "anon");
});
