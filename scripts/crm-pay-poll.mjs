#!/usr/bin/env node
/**
 * Автоопрос кассы Alfa: pay/index филиалы 1–4, pageSize 50, дата/id ≥ штампа.
 * Вместе с кнопкой D ≤ 10 раз в час. Карточка одного клиента — не сюда.
 */
import { pollPaysFromAlfa } from "../src/data/crm-pay.ts";

const res = await pollPaysFromAlfa({ via: "auto" });
console.log(JSON.stringify(res));
process.exit(res.ok || res.skipped ? 0 : 1);
