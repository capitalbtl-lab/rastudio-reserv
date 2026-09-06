import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isChunkLoadError, isTransientHttp, tidyHttpError } from "./http-error.ts";

describe("ошибки шлюза в кабинете", () => {
  it("502 nginx не показывает HTML", () => {
    const html = "<html> <head> <title>502 Bad Gateway</title> </head> <body><h1>502 Bad Gateway</h1></body></html>";
    const msg = tidyHttpError(html);
    assert.equal(/<html|502 Bad Gateway/i.test(msg) && /<head/.test(msg), false);
    assert.match(msg, /не ответил|перезапуск/i);
  });

  it("JSON 500 unhandled — человеческая фраза", () => {
    const msg = tidyHttpError('{"error": true, "status": 500, "unhandled": true}');
    assert.match(msg, /перезапускается/i);
    assert.equal(msg.includes("unhandled"), false);
  });

  it("обычная ошибка не ломается", () => {
    assert.equal(tidyHttpError("Нужен вход администратора."), "Нужен вход администратора.");
  });

  it("502 считается временной", () => {
    assert.equal(isTransientHttp("502 Bad Gateway"), true);
    assert.equal(isTransientHttp("Нужен вход администратора."), false);
  });

  it("пропавший чанк после деплоя — не белый экран", () => {
    assert.equal(isChunkLoadError("Failed to fetch dynamically imported module: https://www.rastudio.org/assets/admin-schedule-CninKylb.js"), true);
    assert.equal(isChunkLoadError("Нужен вход администратора."), false);
    const ui = readFileSync(new URL("../lib/error-component.tsx", import.meta.url), "utf8");
    assert.match(ui, /lazyWithRetry/);
    assert.match(ui, /TabError/);
    assert.match(ui, /Страница устарела|Система обновляется|Кабинет обновляется/);
    const http = readFileSync(new URL("./http-error.ts", import.meta.url), "utf8");
    assert.match(http, /Кабинет обновляется/);
    const prices = readFileSync(new URL("../components/admin-prices.tsx", import.meta.url), "utf8");
    assert.match(prices, /lazyWithRetry/);
    assert.match(prices, /TabPane/);
  });
});
