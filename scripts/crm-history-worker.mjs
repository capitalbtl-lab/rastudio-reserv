#!/usr/bin/env node
/**
 * Фон «Истории из Alfa»: очередь на диске, по одному, пауза 5 с.
 * Сайт только Старт/Стоп/статус. F5 и закрытие вкладки не трогают прогон.
 */
process.env.RA_HISTORY_WORKER = "1";
for (;;) {
  try {
    const { runHistoryWorker } = await import("../src/data/crm-journal-job.ts");
    await runHistoryWorker();
    break;
  } catch (err) {
    console.error("[history-worker]", err);
    await new Promise((r) => setTimeout(r, 4000));
  }
}
