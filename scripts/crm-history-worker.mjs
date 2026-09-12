#!/usr/bin/env node
/**
 * Фон «Истории из Alfa»: очередь на диске, по одному, пауза 5 с.
 * Сайт только Старт/Стоп/статус. F5 и закрытие вкладки не трогают прогон.
 */
process.env.RA_HISTORY_WORKER = "1";
const { runHistoryWorker } = await import("../src/data/crm-journal-job.ts");
await runHistoryWorker();
