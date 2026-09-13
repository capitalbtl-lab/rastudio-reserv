#!/usr/bin/env node
/**
 * 04:00 Europe/Moscow: каталог групп + состав/абонементы только по diff.
 * Второй экземпляр не стартует. Бандл не деплоит.
 */
import { register } from "node:module";

register(new URL("./ts-ext-hook.mjs", import.meta.url));
const { runNightGroupInbound } = await import("../src/data/crm-night-groups.ts");

const res = await runNightGroupInbound({ force: process.argv.includes("--force") });
console.log(JSON.stringify(res));
process.exit(res.ok ? 0 : 1);
