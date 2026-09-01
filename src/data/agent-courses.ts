import seed from "./prices.seed.json";

type Row = { path: string; name: string };

const ROWS = seed as Row[];

const ALIAS: { keys: string[]; path: string }[] = [
  { keys: ["физик", "tesla", "инновац"], path: "/teslaphysics" },
  { keys: ["увлекательн", "science-course", "наука 5"], path: "/science-course" },
  { keys: ["радиотех"], path: "/radioengineering" },
  { keys: ["беспилот", "дрон"], path: "/promising-professions" },
  { keys: ["киндер", "kinder"], path: "/kinder-master" },
  { keys: ["лего", "happybricks", "кирпич"], path: "/happybricks" },
  { keys: ["подготовк", "к школе", "preparation"], path: "/preparation-for-school" },
  { keys: ["steam", "планета"], path: "/planet-steam" },
  { keys: ["3–4", "3-4", "три-четыре"], path: "/art-studio-3-4" },
  { keys: ["5–6", "5-6", "студия 5"], path: "/art-studio-5-6" },
  { keys: ["7–9", "7-8", "7-9", "студия 7"], path: "/art-studio-7-8" },
  { keys: ["10–15", "10-15", "10–14", "9-13", "пятилетн"], path: "/art-studio-9-13" },
  { keys: ["скульпт"], path: "/sculptural-studio" },
  { keys: ["вуз", "hudvuz"], path: "/podgotovka-v-hudvuz" },
  { keys: ["digital", "цифров"], path: "/digitalartschool" },
  { keys: ["манг", "аниме"], path: "/manga-and-anime" },
  { keys: ["модельн", "подиум"], path: "/model-school" },
  { keys: ["робот", "5-6", "5–6", "5-7"], path: "/robototehnika-5-7" },
  { keys: ["робот", "7-9", "7–9"], path: "/robototehnika-7-9" },
  { keys: ["робот", "9-14", "10-14", "10–14"], path: "/robototehnika-10-14" },
  { keys: ["английск", "робот"], path: "/roboticsinenglish" },
  { keys: ["scratch", "старт скул", "startschool", "5-7"], path: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет" },
  { keys: ["create", "криэйт", "7-9"], path: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет" },
  { keys: ["junior", "dev", "3в1", "3 в 1"], path: "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет" },
  { keys: ["python", "пайтон"], path: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python" },
  { keys: ["c++", "си плюс", "программирование на си"], path: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си" },
  { keys: ["unity", "gamedev", "игр"], path: "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity" },
  { keys: ["blender", "блендер", "анимац"], path: "/gamedesign" },
  { keys: ["компас", "3d-модел", "3d модел"], path: "/3d-modeling" },
  { keys: ["super minds", "английск", "sm"], path: "/englishlanguagesm" },
  { keys: ["go getter", "гоу геттер"], path: "/englishlanguagegg" },
  { keys: ["коре"], path: "/vitaminkorean" },
  { keys: ["япон"], path: "/japanese" },
];

function score(query: string, path: string, name: string) {
  const q = query.toLowerCase();
  let n = 0;
  if (path === query || path.endsWith(query)) n += 10;
  if (name.toLowerCase() === q) n += 9;
  if (q.includes(name.toLowerCase()) || name.toLowerCase().includes(q)) n += 5;
  for (const part of name.toLowerCase().split(/[^a-zа-яё0-9+]+/i).filter((w) => w.length > 3)) {
    if (q.includes(part)) n += 2;
  }
  for (const a of ALIAS) {
    if (a.path !== path) continue;
    if (a.keys.every((k) => q.includes(k)) || a.keys.filter((k) => q.includes(k)).length >= 2) n += 4;
    else if (a.keys.some((k) => q.includes(k))) n += 1;
  }
  return n;
}

export function findCoursePage(query: string) {
  const q = (query || "").trim();
  if (!q) return null;
  if (q.startsWith("/")) {
    const hit = ROWS.find((r) => r.path === q || r.path.endsWith(q));
    if (hit) return hit;
  }
  let best: Row | null = null;
  let bestN = 0;
  for (const row of ROWS) {
    const n = score(q, row.path, row.name);
    if (n > bestN) {
      best = row;
      bestN = n;
    }
  }
  return bestN >= 3 ? best : null;
}

export function courseHint(text: string) {
  return findCoursePage(text);
}
