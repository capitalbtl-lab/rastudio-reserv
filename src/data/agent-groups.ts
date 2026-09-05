import { isAdminGroup, readPriority } from "./group-status.ts";

export type AgentTree = {
  schools: { id: string; href: string; label: string }[];
  courses: { id: string; href: string; label: string; schoolId: string; age?: string }[];
};

export type AgentGroupAsk = {
  age?: number;
  branchId?: number;
  course?: string;
  courseId?: string;
  schoolId?: string;
  subjectId?: number;
};

/** Речь родителя → schoolId / courseId дерева. Имя группы CRM не ключ. */
const SCHOOL_ASK: { ask: RegExp; id: string }[] = [
  { ask: /робот/, id: "/robototehnika-v-kolomne" },
  { ask: /худож|рисов|живопис|лепк|скульпт/, id: "/art-studio" },
  { ask: /програм|айти/, id: "/programming-school" },
  { ask: /наук|физик|steam|радио|беспилот|дрон|tesla/, id: "/promising-professions" },
  { ask: /модельн/, id: "/model-school" },
  { ask: /англий|язык/, id: "/languageschool" },
  { ask: /подготовк|школ.*подгот/, id: "/preparation" },
];

/** Речь → courseId. Уникальный ключ. Не название группы. */
export const COURSE_ASK: { keys: string[]; courseId: string }[] = [
  { keys: ["физик", "tesla"], courseId: "/teslaphysics" },
  { keys: ["увлекательн", "science-course"], courseId: "/science-course" },
  { keys: ["радиотех"], courseId: "/radioengineering" },
  { keys: ["беспилот", "дрон"], courseId: "/promising-professions" },
  { keys: ["киндер", "kinder"], courseId: "/kinder-master" },
  { keys: ["лего", "happybricks"], courseId: "/happybricks" },
  { keys: ["подготовк", "к школе"], courseId: "/preparation-for-school" },
  { keys: ["steam", "планета"], courseId: "/planet-steam" },
  { keys: ["скульпт"], courseId: "/sculptural-studio" },
  { keys: ["вуз", "hudvuz"], courseId: "/podgotovka-v-hudvuz" },
  { keys: ["digital", "цифров"], courseId: "/digitalartschool" },
  { keys: ["манг", "аниме"], courseId: "/manga-and-anime" },
  { keys: ["подиум"], courseId: "/model-school-podium" },
  { keys: ["макияж"], courseId: "/model-school-makeup" },
  { keys: ["личностн"], courseId: "/model-school-growth" },
  { keys: ["scratch", "старт скул"], courseId: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет" },
  { keys: ["python", "пайтон"], courseId: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python" },
  { keys: ["c++", "си плюс"], courseId: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си" },
  { keys: ["unity", "gamedev"], courseId: "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity" },
  { keys: ["blender", "блендер"], courseId: "/gamedesign" },
  { keys: ["компас", "3d-модел"], courseId: "/3d-modeling" },
  { keys: ["super minds"], courseId: "/englishlanguagesm" },
  { keys: ["go getter", "гоу геттер"], courseId: "/englishlanguagegg" },
  { keys: ["коре"], courseId: "/vitaminkorean" },
  { keys: ["япон"], courseId: "/japanese" },
];

function ageBandOfAsk(q: string): [number, number] | null {
  const range = q.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})/);
  if (range) return [Number(range[1]), Number(range[2])];
  const plus = q.match(/(\d{1,2})\s*\+/);
  if (plus) return [Number(plus[1]), 18];
  return null;
}

function courseAgeHits(c: { id: string; age?: string }, lo: number, hi: number) {
  const src = `${c.age || ""} ${c.id}`;
  const m = src.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})/);
  if (!m) return false;
  return Number(m[1]) <= hi && Number(m[2]) >= lo;
}

function courseAskHit(q: string): string {
  const hits = COURSE_ASK.filter((a) => a.keys.some((k) => q.includes(k)));
  const unique = [...new Set(hits.map((a) => a.courseId))];
  return unique.length === 1 ? unique[0] : "";
}

function withSlash(raw: string) {
  const t = raw.replace(/^\//, "");
  return `/${t}`;
}

export function resolveAskToTree(ask: string, tree: AgentTree): { schoolId: string; courseId: string } {
  const raw = String(ask || "").trim();
  if (!raw) return { schoolId: "", courseId: "" };
  const path = withSlash(raw);
  const courseEq = tree.courses.find((c) => c.id === raw || c.id === path || c.href === raw || c.href === path);
  if (courseEq) return { schoolId: courseEq.schoolId, courseId: courseEq.id };
  const schoolEq = tree.schools.find((s) => s.id === raw || s.id === path || s.href === raw || s.href === path);
  if (schoolEq) return { schoolId: schoolEq.id, courseId: "" };
  const q = raw.toLowerCase();
  const alias = courseAskHit(q);
  if (alias) {
    const known = tree.courses.find((c) => c.id === alias || c.href === alias);
    if (known) return { schoolId: known.schoolId, courseId: known.id };
    const schoolOf = tree.schools.find((s) => s.id === alias || s.href === alias);
    if (schoolOf) return { schoolId: schoolOf.id, courseId: "" };
    return { schoolId: "", courseId: alias };
  }
  const band = ageBandOfAsk(q);
  for (const a of SCHOOL_ASK) {
    if (!a.ask.test(q)) continue;
    const s = tree.schools.find((x) => x.id === a.id);
    if (!s) continue;
    if (band) {
      const hits = tree.courses.filter((c) => c.schoolId === s.id && courseAgeHits(c, band[0], band[1]));
      if (hits.length === 1) return { schoolId: s.id, courseId: hits[0].id };
      if (hits.length > 1) return { schoolId: s.id, courseId: "" };
    }
    return { schoolId: s.id, courseId: "" };
  }
  return { schoolId: "", courseId: "" };
}

export function slotFitsAgent(
  slot: {
    groupId?: number;
    branchId?: number;
    statusId?: number;
    courseId?: string;
    schoolId?: string;
    path?: string;
    subjectId?: number;
  },
  ask: AgentGroupAsk,
  tree: AgentTree,
) {
  if (!Number(slot.groupId) || !isAdminGroup(slot.statusId)) return false;
  if (ask.branchId && Number(slot.branchId) !== ask.branchId) return false;
  if (ask.subjectId && Number(slot.subjectId) !== ask.subjectId) return false;
  const fromAsk = resolveAskToTree(ask.courseId || ask.schoolId || ask.course || "", tree);
  const courseId = ask.courseId || fromAsk.courseId;
  const schoolId = ask.schoolId || fromAsk.schoolId;
  if ((ask.course || ask.courseId || ask.schoolId) && !courseId && !schoolId) return false;
  if (courseId) return slot.courseId === courseId;
  if (schoolId) return slot.schoolId === schoolId;
  return true;
}

export function agentGroupLine(g: {
  gid: string;
  branchId: number;
  priority?: number;
  courseId?: string;
  schoolId?: string;
  subjectId?: number;
  name?: string;
  short?: string;
  when?: string;
  teacher?: string;
  taken?: number;
  limit?: number;
  seats?: string;
  nextDate?: string;
  timeFrom?: string;
}) {
  const p = readPriority(g.priority);
  return [
    `gid=${g.gid}`,
    `филиал=${g.branchId}`,
    `courseId=${g.courseId || "—"}`,
    `schoolId=${g.schoolId || "—"}`,
    g.subjectId ? `subjectId=${g.subjectId}` : "",
    `приоритет=${p}`,
    g.name || "",
    g.short || "",
    g.when || "",
    g.teacher || "",
    `состав ${g.taken ?? 0}/${g.limit || "—"}`,
    g.seats || "",
    g.nextDate ? `ближайшее ${g.nextDate} ${g.timeFrom || ""}` : "",
    p === 0 ? "набор с сайта закрыт" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
