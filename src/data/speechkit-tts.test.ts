import assert from "node:assert/strict";
import { it, afterEach } from "node:test";
import { synthesize, VoiceError } from "./speechkit-tts.ts";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const speak = () => synthesize("Проверка", "alena", "good", 1, "dummy-key", "dummy-folder", Date.now() + 12000);
it("ошибка авторизации не вызывает перебор голосов и API", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => { calls.push(String(url)); assert.ok(init?.signal); return new Response("denied", { status: 401 }); };
  await assert.rejects(speak(), (e: unknown) => e instanceof VoiceError && e.code === "tts-auth");
  assert.equal(calls.length, 2);
});
it("сохраняется возможность авторизации IAM-токеном", async () => {
  globalThis.fetch = async (_url, init) => String((init?.headers as Record<string, string>).Authorization).startsWith("Bearer")
    ? new Response(new Uint8Array(500)) : new Response("denied", { status: 401 });
  assert.match(await speak(), /^data:audio\/mpeg;base64,/);
});
it("ошибка доступа 403 отличается от ошибки ключа", async () => {
  globalThis.fetch = async () => new Response("forbidden", { status: 403 });
  await assert.rejects(speak(), (e: unknown) => e instanceof VoiceError && e.code === "tts-forbidden");
});
it("429 останавливает запросы сразу", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("limit", { status: 429 }); };
  await assert.rejects(speak(), (e: unknown) => e instanceof VoiceError && e.code === "tts-provider");
  assert.equal(calls, 1);
});
it("успех v1 возвращает звук с одного запроса", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(new Uint8Array(500)); };
  assert.match(await speak(), /^data:audio\/mpeg;base64,/);
  assert.equal(calls, 1);
});
it("совместимость v3 сохраняется после отказа формата v1", async () => {
  globalThis.fetch = async (url) => String(url).includes("/speech/v1/")
    ? new Response("unsupported", { status: 400 })
    : new Response(JSON.stringify({ result: { audioChunk: { data: Buffer.alloc(500).toString("base64") } } }));
  assert.match(await speak(), /^data:audio\/mpeg;base64,/);
});
it("истёкший бюджет не запускает сетевой запрос", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected"); };
  await assert.rejects(synthesize("Текст", "alena", "good", 1, "key", "folder", 0), (e: unknown) => e instanceof VoiceError && e.code === "tts-timeout");
  assert.equal(calls, 0);
});
