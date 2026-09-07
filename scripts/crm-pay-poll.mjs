#!/usr/bin/env node
/**
 * Автоопрос кассы Alfa: новые (дата/id ≥ штампа) и порция истории по курсору филиал/страница.
 * pageSize 50, 4 страницы за запуск. Вместе с кнопкой D ≤ 10 раз в час. Карточка одного клиента — не сюда.
 */
import { pollPaysFromAlfa } from "../src/data/crm-pay.ts";

const res = await pollPaysFromAlfa({ via: "auto" });
console.log(JSON.stringify(res));
process.exit(res.ok || res.skipped ? 0 : 1);
