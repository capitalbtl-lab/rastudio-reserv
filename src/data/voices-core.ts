export const MALE_VOICES = [
  { id: "zahar", label: "Захар — низкий, уверенный" },
  { id: "filipp", label: "Филипп — спокойный, ровный" },
  { id: "ermil", label: "Ермил — живой, бодрый" },
  { id: "madirus", label: "Мадирус — глубокий, мягкий" },
] as const;

export const FEMALE_VOICES = [
  { id: "alena", label: "Алёна — ясный, студийный" },
  { id: "jane", label: "Джейн — мягкий, тёплый" },
  { id: "marina", label: "Марина — живой, разговорный" },
  { id: "oksana", label: "Оксана — чёткий, деловой" },
  { id: "omazh", label: "Омаж — спокойный, низкий" },
] as const;

export const VOICE_MOODS = [
  { id: "good", label: "Радостный, позитивный" },
  { id: "friendly", label: "Дружелюбный" },
  { id: "calm", label: "Спокойный, нейтральный" },
  { id: "quiet", label: "Тихий, мягкий" },
  { id: "strict", label: "Собранный, деловой" },
] as const;

export const VOICE_ROLES = VOICE_MOODS;

export type VoiceSettings = {
  oleg: string;
  olga: string;
  speed: number;
  pause: number;
  mood: string;
  role: string;
  olegSpeed: number;
  olgaSpeed: number;
  olegMood: string;
  olgaMood: string;
  olegVolume: number;
  olgaVolume: number;
  turnGap: number;
  sampleOleg: string;
  sampleOlga: string;
};

export const DEFAULT_VOICE: VoiceSettings = {
  oleg: "zahar",
  olga: "alena",
  speed: 1.18,
  pause: 0.08,
  mood: "good",
  role: "good",
  olegSpeed: 1.18,
  olgaSpeed: 1.16,
  olegMood: "good",
  olgaMood: "good",
  olegVolume: 1,
  olgaVolume: 1,
  turnGap: 0.18,
  sampleOleg: "Здравствуйте, я Олег. Расскажу про робототехнику и программирование в студии Развивайся.",
  sampleOlga: "Здравствуйте, я Ольга. Подберём курс, который подойдёт вашему ребёнку.",
};
