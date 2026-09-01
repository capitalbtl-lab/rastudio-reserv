import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type CrmSubject = { id: number; name: string; local?: boolean };

export const SEED_SUBJECTS: CrmSubject[] = [
  { id: 116, name: "Художественная студия (4-5 лет)" },
  { id: 115, name: "Основы портрета (12+)" },
  { id: 114, name: "Билингвальная робототехника (7–9, 10-13 лет)" },
  { id: 111, name: "Английский язык \"Go Getter\" (9–14 лет)" },
  { id: 110, name: "Английский язык \"Super Minds\" (6–8 лет)" },
  { id: 112, name: "Корейский язык \"Vitamin Korean\" (9–16 лет)" },
  { id: 113, name: "Японский язык «Kodomo no Nihongo» (9–16 лет)" },
  { id: 108, name: "Развивающий курс \"Лего-Математика\" (3-6 лет)" },
  { id: 109, name: "Развивающий курс \"Планета S.T.E.A.M.\" (3-6 лет)" },
  { id: 27, name: "Развивающий курс \"Увлекательная наука\" (5-9 лет)" },
  { id: 25, name: "Беспилотная авиация (9-13 лет)" },
  { id: 107, name: "3D-анимация в Blender (15-15 лет)" },
  { id: 39, name: "Инженерное 3D моделирование в Компас (10-15 лет)" },
  { id: 4, name: "Модельная школа" },
  { id: 89, name: "Научный курс \"Физика инноваций\" (11+)" },
  { id: 97, name: "Основы цифрового рисунка (12-15 лет)" },
  { id: 5, name: "Подготовка в художественные ВУЗы (от 14 лет)" },
  { id: 16, name: "Подготовка к школе (5-6 лет)" },
  { id: 43, name: "IT-Лаборатория Start: \"Первые шаги в мир цифры и STEAM\"" },
  { id: 98, name: "IT-Лаборатория Create: \"Создатель игр и IT-проектов\"" },
  { id: 15, name: "IT-Лаборатория Dev: \"Юный разработчик в сфере IT\"" },
  { id: 46, name: "IT-Школа: \"Программирование на Python с CodeBOOK\"" },
  { id: 52, name: "IT-Школа: \"GameDev 4в1 - разработка игр на Unity\"" },
  { id: 48, name: "IT-Школа: \"Программирование на С++\"" },
  { id: 36, name: "Робототехника (5-6 лет)" },
  { id: 37, name: "Робототехника (7-9 лет)" },
  { id: 67, name: "Радиотехника (9+)" },
  { id: 35, name: "Робототехника (9-11, 11-14 лет)" },
  { id: 11, name: "Скульптурная студия (5-7, 8-14 лет)" },
  { id: 92, name: "Художественная школа (10-14 лет)" },
  { id: 14, name: "Художественная студия (7-9 лет)" },
  { id: 13, name: "Художественная студия (5-6 лет)" },
  { id: 12, name: "Художественная студия (3-4 лет)" },
  { id: 7, name: "Экскурсионная поездка" },
  { id: 54, name: "Индивидуальный урок" },
  { id: 104, name: "Групповое мероприятие" },
  { id: 85, name: "Фиджитал-программа «Игры будущего» (7-13 лет)" },
  { id: 81, name: "Творческая программа «ДаВинчи» (9-12 лет)" },
  { id: 1, name: "Радиотехническая программа «Мьюзик Бокс» (9-14 лет)" },
  { id: 77, name: "Научная программа \"Покорители планет\" (7-12 лет)" },
  { id: 106, name: "Радиотехническая программа «Кладоискатели» (9-14 лет)" },
  { id: 82, name: "Робототехническая программа «Робополис» (7-12 лет)" },
  { id: 105, name: "Робототехническая программа «Робофабрика» (10-15 лет)" },
  { id: 83, name: "Радиотехническая программа «Сделай радио» (9-15 лет)" },
  { id: 90, name: "Творческая программа \"Вдохновляйся!\" (7-12 лет)" },
  { id: 84, name: "Радиотехническая программа «Машина времени» (9-15 лет)" },
  { id: 88, name: "Стартап-Программа \"Мастера Будущего\" (10-15 лет)" },
  { id: 87, name: "Бьюти-программа \"Beauty & Art\" (9-15 лет)" },
];

function filePath() {
  return join(process.cwd(), "storage", "crm-subjects.json");
}

export function foldSubject(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/["«»„“]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadSubjects(): CrmSubject[] {
  try {
    if (existsSync(filePath())) {
      const raw = JSON.parse(readFileSync(filePath(), "utf8")) as { items?: CrmSubject[] };
      if (Array.isArray(raw.items) && raw.items.length) return raw.items;
    }
  } catch {
    /* */
  }
  return SEED_SUBJECTS.map((s) => ({ ...s }));
}

export function saveSubjects(items: CrmSubject[]) {
  mkdirSync(dirname(filePath()), { recursive: true });
  const uniq = new Map<number, CrmSubject>();
  let nextLocal = 9000;
  for (const s of items) {
    const id = Number(s.id) || nextLocal++;
    uniq.set(id, { id, name: String(s.name || "").trim(), local: Boolean(s.local) && !s.id });
  }
  const list = [...uniq.values()].filter((s) => s.name).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  writeFileSync(filePath(), JSON.stringify({ at: new Date().toISOString(), items: list }, null, 2));
  return list;
}

export function matchSubject(name: string, list = loadSubjects()): CrmSubject | undefined {
  const n = foldSubject(name);
  if (!n) return;
  const exact = list.find((s) => foldSubject(s.name) === n);
  if (exact) return exact;
  const loose = list.find((s) => {
    const m = foldSubject(s.name);
    return m.length > 8 && (n.includes(m) || m.includes(n));
  });
  return loose;
}

function crmId(res: unknown) {
  const r = res as { model?: { id?: number }; id?: number };
  return Number(r?.model?.id || r?.id || 0);
}

export async function pullSubjectsFromCrm() {
  const { token, request } = await import("./alfacrm");
  const t = await token();
  const res = await request<{ items?: { id?: number; name?: string }[] }>("/v2api/2/subject/index", { page: 0, pageSize: 300 }, t);
  const byId = new Map<number, CrmSubject>();
  for (const s of SEED_SUBJECTS) byId.set(s.id, { ...s });
  for (const s of res.items || []) {
    const id = Number(s.id);
    const name = String(s.name || "").trim();
    if (!id || !name) continue;
    byId.set(id, { id, name });
  }
  return saveSubjects([...byId.values()]);
}

export async function pushSubjectsToCrm(items: CrmSubject[]) {
  const { token, request } = await import("./alfacrm");
  const t = await token();
  const next: CrmSubject[] = [];
  const results: { name: string; id: number; ok: boolean; error?: string }[] = [];
  for (const s of items) {
    try {
      if (s.id && s.id < 9000 && !s.local) {
        await request("/v2api/2/subject/update", { id: s.id, name: s.name }, t);
        next.push({ id: s.id, name: s.name });
        results.push({ name: s.name, id: s.id, ok: true });
      } else {
        const created = await request("/v2api/2/subject/create", { name: s.name }, t);
        const id = crmId(created) || s.id;
        if (!id) throw new Error("CRM не вернула id предмета");
        next.push({ id, name: s.name });
        results.push({ name: s.name, id, ok: true });
      }
    } catch (e) {
      next.push(s);
      results.push({ name: s.name, id: s.id, ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "ошибка" });
    }
  }
  saveSubjects(next);
  return { items: loadSubjects(), results };
}
