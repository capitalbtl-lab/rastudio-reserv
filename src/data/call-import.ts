import { loadNovofonKeys, listRecordedCalls, monthWindows, recordLink, saveNovofonKeys, type NovofonKeys } from "./novofon";
import { transcribeUrl } from "./stt";
import { buildKnowledge, callStats, nextWithoutTranscript, saveTranscript, upsertCalls } from "./call-knowledge";

export async function scanNovofon(months = 24) {
  const keys = loadNovofonKeys();
  if (!keys) throw new Error("no-keys");
  const all = [];
  for (const win of monthWindows(months)) {
    const rows = await listRecordedCalls(win.start, win.end, keys);
    all.push(...rows);
  }
  const uniq = new Map(all.map((c) => [c.pbx_call_id || c.call_id, c]));
  upsertCalls([...uniq.values()]);
  return callStats();
}

export async function transcribeBatch(limit = 4) {
  const keys = loadNovofonKeys();
  if (!keys) throw new Error("no-keys");
  const batch = nextWithoutTranscript(limit);
  let done = 0;
  for (const call of batch) {
    const id = call.pbx_call_id || call.call_id;
    try {
      const link = await recordLink(call, keys);
      if (!link) {
        saveTranscript(id, "", "нет файла записи");
        continue;
      }
      const text = await transcribeUrl(link, id.replace(/[^\w.-]+/g, "_").slice(0, 80));
      saveTranscript(id, text || "", text ? undefined : "пусто");
      if (text) done += 1;
    } catch (err) {
      saveTranscript(id, "", err instanceof Error ? err.message : "ошибка");
    }
  }
  return { ...callStats(), batch: batch.length, done };
}

export function connectNovofon(keys: NovofonKeys) {
  saveNovofonKeys(keys);
}

export { callStats, buildKnowledge, loadNovofonKeys };