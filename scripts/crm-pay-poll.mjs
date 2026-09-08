#!/usr/bin/env node
/**
 * Автоопрос кассы Alfa каждые 15 минут: все типы за последние 3 дня (доход, продажи, возвраты, корректировки).
 * Сверяет изменения и пересчитывает остаток ученика. История старше окна — кнопка «Обновить кассу».
 */
import { pollPaysFromAlfa } from "../src/data/crm-pay.ts";

const res = await pollPaysFromAlfa({ via: "auto" });
console.log(JSON.stringify(res));
process.exit(res.ok || res.skipped ? 0 : 1);
