export const DEBUG_TOOLS = [
  { id: "chat", label: "Лента чата", hint: "Сырые сообщения Олега и Ольги, как уходят в историю." },
  { id: "funnel", label: "Воронка", hint: "Возраст, город, филиал — что агент уже запомнил." },
  { id: "voice", label: "Голос и микрофон", hint: "TTS, SpeechRecognition, не просит ли телефон микрофон снова." },
  { id: "net", label: "Ответ агента", hint: "Последний chatAgent: длина, ошибка, канал." },
] as const;

export type DebugToolId = (typeof DEBUG_TOOLS)[number]["id"];

export function debugEmit(kind: string, payload: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("ra-debug", { detail: { kind, payload, at: Date.now() } }));
  } catch {
    /* */
  }
}

export function debugSessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("ra-debug-session"));
}
