/** Голосовой контур окна: эхо TTS, VAD перебивания, ошибки распознавания. Без DOM. */

export function normalizeSaid(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\d\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isVoiceEcho(
  said: string,
  spoken: string,
  opts?: { loose?: boolean; spokenAgoMs?: number },
) {
  if ((opts?.spokenAgoMs || 0) > 900) return false;
  const a = normalizeSaid(said);
  const b = normalizeSaid(spoken);
  if (!a || !b) return false;
  const words = a.split(" ").filter((w) => w.length > 2);
  if (words.length < 2) return b.includes(a) && a.length > 10;
  const hits = words.filter((w) => b.includes(w)).length;
  return hits / words.length >= (opts?.loose ? 0.55 : 0.78);
}

export type VadState = { noise: number; over: number; samples: number };

export function emptyVad(): VadState {
  return { noise: 0.012, over: 0, samples: 0 };
}

/** RMS после echoCancellation. Порог от шума, не константа 0.11 — из‑за неё перебивание молчало. */
export function vadTick(state: VadState, rms: number, bargeOn: boolean): { state: VadState; fire: boolean } {
  if (!bargeOn) return { state: emptyVad(), fire: false };
  const samples = state.samples + 1;
  let noise = state.noise;
  if (samples < 16) {
    noise = noise * 0.65 + Math.min(0.08, rms) * 0.35;
    return { state: { noise, over: 0, samples }, fire: false };
  }
  noise = Math.min(0.045, noise * 0.995 + Math.min(rms, 0.06) * 0.005);
  const thresh = Math.max(0.032, noise * 2.8);
  const over = rms > thresh ? state.over + 1 : Math.max(0, state.over - 1);
  if (over >= 4) return { state: { noise, over: 0, samples }, fire: true };
  return { state: { noise, over, samples }, fire: false };
}

export function srFatal(err: string) {
  return err === "not-allowed" || err === "service-not-allowed";
}

export function srShouldRestart(err: string) {
  return !srFatal(err);
}

export function bargeInterimReady(said: string, isFinal: boolean) {
  const words = String(said || "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (isFinal) return words.length >= 1;
  return words.length >= 2;
}

export function ignoreWhileSpeakStartMs(barge: boolean) {
  return barge ? 200 : 380;
}

export function ignoreAfterSpeakMs(barge: boolean) {
  return barge ? 90 : 120;
}

export function listenGapAfterSpeakMs(barge: boolean) {
  return barge ? 20 : 40;
}
