#!/usr/bin/env node
/**
 * Автоопрос кассы Alfa каждые 5 минут: только новые (дата/id ≥ штампа филиала).
 * История — кнопка «Обновить кассу». Карточка одного клиента — не сюда.
 */
import { pollPaysFromAlfa } from "../src/data/crm-pay.ts";

const res = await pollPaysFromAlfa({ via: "auto" });
console.log(JSON.stringify(res));
process.exit(res.ok || res.skipped ? 0 : 1);
