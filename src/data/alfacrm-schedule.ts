import type { CmsSession } from "@/data/cms";
import { request, token } from "@/data/alfacrm";

const SKIP_SUBJECT = new Set([7, 54, 104, 85, 81, 1, 77, 106, 82, 105, 83, 90, 84, 88, 87]);
const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

const SUBJECT_PATH: Record<number, string> = {
  12: "/art-studio-3-4",
  116: "/art-studio-3-4",
  13: "/art-studio-5-6",
  14: "/art-studio-7-8",
  92: "/art-studio-9-13",
  115: "/art-studio-9-13",
  5: "/podgotovka-v-hudvuz",
  11: "/sculptural-studio",
  97: "/digitalartschool",
  36: "/robototehnika-5-7",
  37: "/robototehnika-7-9",
  35: "/robototehnika-10-14",
  114: "/roboticsinenglish",
  46: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
  48: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си",
  52: "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity",
  43: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет",
  98: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет",
  15: "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет",
  107: "/gamedesign",
  39: "/3d-modeling",
  27: "/science-course",
  89: "/teslaphysics",
  67: "/radioengineering",
  25: "/robototehnika-v-kolomne",
  16: "/preparation-for-school",
  108: "/happybricks",
  109: "/science-course",
  4: "/model-school",
  110: "/englishlanguagesm",
  111: "/englishlanguagegg",
  112: "/vitaminkorean",
  113: "/japanese",
};

const BRANCH: Record<number, { city: string; branch: string }> = {
  1: { city: "Коломна", branch: "ул. Гражданская, 2" },
  2: { city: "Коломна", branch: "ул. Октябрьской революции, 340" },
  3: { city: "Луховицы", branch: "ул. Пушкина, 202А" },
};

type Group = { id: number; name: string; note?: string };
type Lesson = {
  id: number;
  related_id?: number | null;
  subject_id?: number;
  branch_id?: number;
  day?: number;
  time_from_v?: string;
  time_to_v?: string;
  teacher_ids?: number[];
};
type Subject = { id: number; name: string };

let cache: { at: number; sessions: CmsSession[] } | null = null;
const TTL = 10 * 60 * 1000;

function ageOf(name: string) {
  const m = name.match(/(\d+\s*[–-]\s*\d+\s*(?:лет|года)?|\d+\s*\+\s*|\d+\s*лет)/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function whenOf(day?: number, from?: string, to?: string) {
  const label = DAYS[(Number(day) || 1) - 1] || "День уточняется";
  if (from && to) return `${label} с ${from} до ${to}`;
  return label;
}

export async function sessionsFromCrm(): Promise<CmsSession[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.sessions;
  const t = await token();
  const sessions: CmsSession[] = [];
  const subjects = new Map<number, string>();
  const sub = await request<{ items?: Subject[] }>("/v2api/2/subject/index", { page: 0, pageSize: 200 }, t);
  for (const s of sub.items || []) subjects.set(s.id, s.name);
  for (const branch of [1, 2, 3]) {
    const groups = await request<{ items?: Group[] }>(`/v2api/${branch}/group/index`, { page: 0, pageSize: 200 }, t);
    const groupMap = new Map((groups.items || []).map((g) => [g.id, g]));
    const lessons = await request<{ items?: Lesson[] }>(
      `/v2api/${branch}/regular-lesson/index`,
      { page: 0, pageSize: 200 },
      t,
    );
    const meta = BRANCH[branch];
    for (const lesson of lessons.items || []) {
      const sid = Number(lesson.subject_id);
      if (!sid || SKIP_SUBJECT.has(sid)) continue;
      const group = lesson.related_id ? groupMap.get(lesson.related_id) : undefined;
      if (group && /отложен/i.test(group.name)) continue;
      const subjectName = subjects.get(sid) || group?.name || "Курс";
      const age = ageOf(group?.name || "") || ageOf(subjectName);
      sessions.push({
        id: `crm-${lesson.id}`,
        group: group?.name || subjectName,
        age,
        when: whenOf(lesson.day, lesson.time_from_v, lesson.time_to_v),
        teacherId: String(lesson.teacher_ids?.[0] || ""),
        signup: SUBJECT_PATH[sid] || "",
        city: meta.city,
        branch: meta.branch,
        directionId: String(sid),
        courseId: String(sid),
        ageTag: age,
        courseFilter: subjectName,
      });
    }
  }
  cache = { at: Date.now(), sessions };
  return sessions;
}

export function filterCrmSessions(sessions: CmsSession[], splat?: string | null) {
  if (!splat) return sessions;
  let decoded = splat.startsWith("/") ? splat : `/${splat}`;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep */
  }
  if (decoded === "/" || decoded === "/schedule" || decoded === "/allcourses") return sessions;
  if (decoded === "/art-studio") {
    return sessions.filter((s) => /art-studio|hudvuz|sculptural|digitalart/.test(s.signup));
  }
  if (decoded === "/robototehnika-v-kolomne") {
    return sessions.filter((s) => /robot/.test(s.signup));
  }
  if (decoded === "/programming-school") {
    return sessions.filter((s) => s.signup.includes("kursy-shkoly-programmirovaniya") || s.signup === "/gamedesign" || s.signup === "/3d-modeling");
  }
  if (decoded === "/languageschool") {
    return sessions.filter((s) => /english|vitamin|japanese/.test(s.signup));
  }
  if (decoded === "/promising-professions") {
    return sessions.filter((s) => /tesla|science|radio|3d-modeling/.test(s.signup));
  }
  return sessions.filter((s) => s.signup === decoded);
}
