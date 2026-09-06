/** Голосовой контур окна: эхо TTS, VAD перебивания, ошибки распознавания. Без DOM. */

export function normalizeSaid(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\d\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HELLO_RE =
  /^(привет|приветствую|здравствуйте|здравствуй|добрый день|добрый вечер|доброе утро|алло|хай|хеллоу|hello|hi)(те)?$/i;

export function isSocialHello(s: string) {
  return HELLO_RE.test(normalizeSaid(s));
}

/** Короткий ответ на развилку — не эхо своей фразы «скажите: уже ходим». */
export function isDirectChoice(s: string) {
  const a = normalizeSaid(s);
  if (!a) return false;
  if (isSocialHello(a)) return true;
  return /^(мы )?уже ходим( к вам)?$/.test(a) || /^(подбираем( курс)? впервые|впервые)$/.test(a) || /^(правила|цены|правила и цены)$/.test(a);
}

export function echoTailMs() {
  return 1800;
}

export function isVoiceEcho(
  said: string,
  spoken: string,
  opts?: { loose?: boolean; spokenAgoMs?: number; speaking?: boolean },
) {
  const a = normalizeSaid(said);
  const b = normalizeSaid(spoken);
  if (!a || !b) return false;
  if (isDirectChoice(a)) return false;
  if (!opts?.speaking && (opts?.spokenAgoMs || 0) > echoTailMs()) return false;
  const words = a.split(" ").filter((w) => w.length > 1);
  if (words.length < 2) {
    const w = words[0] || a;
    if (w.length < 4) return false;
    return b.includes(w);
  }
  const hits = words.filter((w) => b.includes(w)).length;
  return hits / words.length >= (opts?.speaking || opts?.loose ? 0.45 : 0.72);
}

export type VadState = { noise: number; over: number; samples: number };

export function emptyVad(): VadState {
  return { noise: 0.012, over: 0, samples: 0 };
}

/** RMS после echoCancellation. Порог от шума. Сам по себе не глушит TTS — это делает распознавание без эха. */
export function vadTick(state: VadState, rms: number, bargeOn: boolean): { state: VadState; fire: boolean } {
  if (!bargeOn) return { state: emptyVad(), fire: false };
  const samples = state.samples + 1;
  let noise = state.noise;
  if (samples < 16) {
    noise = noise * 0.65 + Math.min(0.08, rms) * 0.35;
    return { state: { noise, over: 0, samples }, fire: false };
  }
  noise = Math.min(0.045, noise * 0.995 + Math.min(rms, 0.06) * 0.005);
  const thresh = Math.max(0.038, noise * 3.2);
  const over = rms > thresh ? state.over + 1 : Math.max(0, state.over - 1);
  if (over >= 8) return { state: { noise, over: 0, samples }, fire: true };
  return { state: { noise, over, samples }, fire: false };
}

export function srFatal(err: string) {
  return err === "not-allowed" || err === "service-not-allowed";
}

export function srShouldRestart(err: string) {
  return !srFatal(err);
}

export function bargeInterimReady(said: string, isFinal: boolean) {
  if (isSocialHello(said)) return isFinal;
  const words = String(said || "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (isFinal) return words.length >= 1;
  return words.length >= 2;
}

export function ignoreWhileSpeakStartMs(barge: boolean) {
  return barge ? 480 : 700;
}

export function ignoreAfterSpeakMs(barge: boolean) {
  return barge ? 700 : 1000;
}

export function listenGapAfterSpeakMs(barge: boolean) {
  return barge ? 80 : 120;
}
